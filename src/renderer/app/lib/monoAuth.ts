import electronApi from '@/renderer/app/lib/electronApi';

/**
 * Drop-in replacement for the bits of `firebase/auth` that AuthContext and
 * AuthCache used to pull in. Backed by the main-process TokenManager via
 * IPC — tokens never live in renderer storage, only in safeStorage in
 * main.
 *
 * The Firebase-Auth shape is preserved deliberately: AuthContext is a
 * 1,100-line file with `auth.currentUser`, `user.getIdToken(forceRefresh)`,
 * `onAuthStateChanged`, `onIdTokenChanged`, and `auth.signOut()` all
 * scattered through it. Mirroring the surface here keeps the consumer-side
 * diff small and the migration mechanical.
 */

export interface MonoUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  /**
   * Mirrors Firebase's `User.getIdToken(forceRefresh)`. When `forceRefresh`
   * is true we round-trip through `/auth/refresh`; otherwise the cached
   * access token is returned (or null if signed out).
   */
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export interface MonoAuth {
  /**
   * Current signed-in user, or null. Updated synchronously from the
   * cached state mirror; callers wanting to await the *first* hydration
   * should subscribe to `onAuthStateChanged`.
   */
  currentUser: MonoUser | null;
  signOut: () => Promise<void>;
  onAuthStateChanged: (cb: (user: MonoUser | null) => void) => () => void;
  /**
   * Fires whenever the access token rotates (same semantics as Firebase's
   * `onIdTokenChanged`). Useful for layers that need to update bearer
   * headers without re-rendering React state.
   */
  onIdTokenChanged: (cb: (user: MonoUser | null) => void) => () => void;
}

type Listener = (user: MonoUser | null) => void;

// ---- Cached state mirror -----------------------------------------------
// We mirror the IPC-fetched state into renderer memory so synchronous reads
// (currentUser) work the same way they did under Firebase. The mirror is
// refreshed on token-changed and signed-out events from main.

interface AuthMirror {
  accessToken: string | null;
  expiresAt: number;
  member: {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
  } | null;
}

const mirror: AuthMirror = { accessToken: null, expiresAt: 0, member: null };
const authStateListeners = new Set<Listener>();
const idTokenListeners = new Set<Listener>();
let hydrated = false;

function buildUser(): MonoUser | null {
  // The access token alone is enough to bootstrap — `fetchData` in
  // AuthContext calls `user.getIdToken()` to authorise `/mono/user/info`,
  // and that response populates the member fields. So we don't gate on
  // `mirror.member`; we just return empty strings until it loads.
  if (!mirror.accessToken) return null;
  const m = mirror.member;
  return {
    uid: m?.uid ?? '',
    email: m?.email ?? null,
    displayName: m?.displayName ?? null,
    photoURL: m?.photoURL ?? null,
    getIdToken: async (forceRefresh?: boolean) => {
      if (!forceRefresh && mirror.accessToken && mirror.expiresAt > Date.now() + 5_000) {
        return mirror.accessToken;
      }
      const res = await electronApi.refreshToken();
      if (!res.ok) throw new Error(res.error || 'Token refresh failed');
      // The token-changed event will repopulate the mirror; meanwhile
      // return the freshly-issued one directly.
      mirror.accessToken = res.accessToken;
      mirror.expiresAt = res.expiresAt;
      return res.accessToken;
    }
  };
}

function notify(listeners: Set<Listener>): void {
  const user = buildUser();
  for (const cb of listeners) {
    try {
      cb(user);
    } catch (e) {
      console.error('[monoAuth] listener threw:', e);
    }
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const state = await electronApi.getAuthState();
    if (state) {
      mirror.accessToken = state.accessToken;
      mirror.expiresAt = state.expiresAt;
      mirror.member = state.member ?? null;
    }
  } catch (e) {
    console.error('[monoAuth] initial hydration failed:', e);
  }
  notify(authStateListeners);
  notify(idTokenListeners);
}

// Wire up IPC event listeners once.
electronApi.on<{ accessToken: string; expiresAt: number }>(
  'renderer:auth:token-changed',
  (payload) => {
    mirror.accessToken = payload.accessToken;
    mirror.expiresAt = payload.expiresAt;
    // Member shape isn't included in this event; consumers that need it
    // should re-hydrate via getAuthState if they didn't have it yet.
    if (!mirror.member) {
      electronApi.getAuthState().then((s) => {
        if (s) mirror.member = s.member ?? null;
        notify(authStateListeners);
      });
    }
    notify(idTokenListeners);
  }
);

electronApi.on('renderer:auth:signed-out', () => {
  mirror.accessToken = null;
  mirror.expiresAt = 0;
  mirror.member = null;
  notify(authStateListeners);
  notify(idTokenListeners);
});

export const auth: MonoAuth = {
  get currentUser() {
    return buildUser();
  },
  signOut: async () => {
    await electronApi.signOutMain();
  },
  onAuthStateChanged: (cb) => {
    authStateListeners.add(cb);
    // Hydrate on first subscription so the consumer gets an initial fire.
    hydrate().then(() => {
      try {
        cb(buildUser());
      } catch (e) {
        console.error('[monoAuth] initial cb threw:', e);
      }
    });
    return () => authStateListeners.delete(cb);
  },
  onIdTokenChanged: (cb) => {
    idTokenListeners.add(cb);
    hydrate().then(() => {
      try {
        cb(buildUser());
      } catch (e) {
        console.error('[monoAuth] initial cb threw:', e);
      }
    });
    return () => idTokenListeners.delete(cb);
  }
};

/**
 * Equivalent of `signInWithCustomToken` for the Phase-B world. The tokens
 * come from the OAuth deep-link, which goes through main first — by the
 * time the renderer learns about sign-in, main has already persisted the
 * tokens. So this is a no-op: the renderer just observes via
 * `onAuthStateChanged` / `renderer:auth:token-changed`.
 *
 * Kept as an exported symbol so call sites in AuthContext that say
 * `await signInWithCustomToken(auth, token)` can be mechanically renamed
 * to `await signInWithToken(_, token)` without restructuring.
 */
export async function signInWithToken(_auth: MonoAuth, _token: string): Promise<void> {
  // Main owns sign-in; nothing for the renderer to do here.
  return Promise.resolve();
}

/**
 * Free-function form of `auth.onAuthStateChanged(cb)` mirroring Firebase's
 * `import { onAuthStateChanged } from 'firebase/auth'` ergonomics. The
 * `auth` argument exists only to match the legacy call signature; the
 * facade is a singleton.
 */
export function onAuthStateChanged(
  _auth: MonoAuth,
  cb: (user: MonoUser | null) => void
): () => void {
  return auth.onAuthStateChanged(cb);
}
