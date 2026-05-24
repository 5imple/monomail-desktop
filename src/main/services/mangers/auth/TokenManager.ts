import { EventEmitter } from 'events';
import { net, safeStorage } from 'electron';
import log from 'electron-log';
import Store from 'electron-store';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute epoch ms when the access token expires. */
  expiresAt: number;
  /** Optional cached profile so the renderer can hydrate before the next backend round-trip. */
  member?: {
    uid: string;
    email: string;
    displayName?: string;
    photoURL?: string;
  };
  /**
   * Which auth provider issued these tokens. 'google' = PKCE direct OAuth;
   * undefined / 'backend' = legacy backend-proxied flow. Controls which
   * refresh endpoint doRefresh() calls.
   */
  provider?: 'google' | 'backend';
  /**
   * Direct-Google mode needs one OAuth token set per Gmail account. The
   * top-level token remains the signed-in session; this map lets mail calls
   * resolve the correct bearer token for each account uid.
   */
  googleAccounts?: Record<string, StoredGoogleAccount>;
}

interface StoredGoogleAccount {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}

interface StoreSchema {
  /** Encrypted JSON blob (safeStorage.encryptString → base64). */
  authEnc?: string;
}

// Refresh this many ms before the access token expires. Generous because
// every API call also passes through the same refresh path on 401, so the
// timer is a freshness hint, not a hard guarantee.
const REFRESH_LEAD_MS = 60_000;

// Floor on the auto-refresh timer so a misbehaving backend that issues
// near-instant-expiry tokens doesn't pin the event loop in a tight loop.
const MIN_REFRESH_INTERVAL_MS = 5_000;
const DIRECT_GOOGLE_SCOPES = [
  'https://mail.google.com',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];

/**
 * Owns the on-prem JWT lifecycle in the main process. Persists tokens
 * encrypted via safeStorage (OS keychain on macOS, DPAPI on Windows,
 * libsecret on Linux), schedules background refresh against the backend,
 * and emits 'token-changed' / 'signed-out' so the renderer + WebSocket
 * push client can react.
 *
 * The renderer never touches the refresh token — it only sees the current
 * access token (via IPC `main:auth:get-state`).
 */
class TokenManager extends EventEmitter {
  private static instance: TokenManager;
  private store: Store<StoreSchema>;
  private tokens: StoredTokens | null = null;
  private activeUid: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<StoredTokens> | null = null;

  private constructor() {
    super();
    this.store = new Store<StoreSchema>();
    this.loadFromDisk();
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  // ---------- Persistence ----------

  private loadFromDisk(): void {
    try {
      const enc = this.store.get('authEnc');
      if (!enc) return;
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[TokenManager] safeStorage unavailable on this platform; ignoring saved tokens');
        return;
      }
      const plain = safeStorage.decryptString(Buffer.from(enc, 'base64'));
      const parsed = JSON.parse(plain) as StoredTokens;
      if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
        log.warn('[TokenManager] persisted token blob missing required fields; ignoring');
        this.store.delete('authEnc');
        return;
      }
      this.tokens = parsed;
      this.scheduleAutoRefresh();
      log.info(
        '[TokenManager] loaded persisted tokens (expires in %dms)',
        parsed.expiresAt - Date.now()
      );
    } catch (e) {
      log.error('[TokenManager] loadFromDisk failed:', (e as Error).message);
      this.store.delete('authEnc');
    }
  }

  private persist(): void {
    try {
      if (!this.tokens) {
        this.store.delete('authEnc');
        return;
      }
      if (!safeStorage.isEncryptionAvailable()) {
        log.warn('[TokenManager] safeStorage unavailable; tokens kept in memory only');
        return;
      }
      const enc = safeStorage.encryptString(JSON.stringify(this.tokens)).toString('base64');
      this.store.set('authEnc', enc);
    } catch (e) {
      log.error('[TokenManager] persist failed:', (e as Error).message);
    }
  }

  private toStoredGoogleAccount(args: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    member: NonNullable<StoredTokens['member']>;
  }): StoredGoogleAccount {
    return {
      uid: args.member.uid,
      email: args.member.email,
      displayName: args.member.displayName,
      photoURL: args.member.photoURL,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scopes: DIRECT_GOOGLE_SCOPES
    };
  }

  private getGoogleAccountsMap(seedCurrent = false): Record<string, StoredGoogleAccount> {
    const accounts = { ...(this.tokens?.googleAccounts ?? {}) };
    if (
      seedCurrent &&
      this.tokens?.provider === 'google' &&
      this.tokens.member &&
      !accounts[this.tokens.member.uid]
    ) {
      accounts[this.tokens.member.uid] = this.toStoredGoogleAccount({
        accessToken: this.tokens.accessToken,
        refreshToken: this.tokens.refreshToken,
        expiresAt: this.tokens.expiresAt,
        member: this.tokens.member
      });
    }
    return accounts;
  }

  // ---------- Public API ----------

  saveTokens(input: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
    expiresAt?: number;
    member?: StoredTokens['member'];
    provider?: StoredTokens['provider'];
  }): void {
    const expiresAt =
      input.expiresAt ??
      (input.expiresInSec != null ? Date.now() + input.expiresInSec * 1000 : Date.now() + 3600_000);
    let googleAccounts =
      input.provider === 'backend'
        ? this.tokens?.googleAccounts // preserve secondary Google accounts across backend token refreshes
        : this.getGoogleAccountsMap(input.provider === 'google');
    if (input.provider === 'google' && input.member) {
      googleAccounts = {
        ...(googleAccounts ?? {}),
        [input.member.uid]: this.toStoredGoogleAccount({
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt,
          member: input.member
        })
      };
    }
    this.tokens = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
      member: input.member,
      provider: input.provider ?? this.tokens?.provider ?? 'backend',
      googleAccounts
    };
    this.persist();
    this.scheduleAutoRefresh();
    this.emit('token-changed', this.tokens);
  }

  saveGoogleAccountTokens(input: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
    expiresAt?: number;
    member: NonNullable<StoredTokens['member']>;
  }): StoredGoogleAccount {
    if (!this.tokens) throw new Error('Not signed in');
    const expiresAt =
      input.expiresAt ??
      (input.expiresInSec != null ? Date.now() + input.expiresInSec * 1000 : Date.now() + 3600_000);
    const account = this.toStoredGoogleAccount({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
      member: input.member
    });
    this.tokens = {
      ...this.tokens,
      googleAccounts: {
        ...this.getGoogleAccountsMap(true),
        [account.uid]: account
      }
    };
    this.persist();
    this.emit('google-accounts-changed', this.getGoogleAccounts());
    return account;
  }

  removeGoogleAccount(uid: string): boolean {
    const accounts = this.getGoogleAccountsMap(true);
    if (!accounts[uid]) return false;
    if (this.tokens?.member?.uid === uid) return false; // primary account — must sign out instead
    const updated = { ...accounts };
    delete updated[uid];
    this.tokens = {
      ...this.tokens!,
      googleAccounts: Object.keys(updated).length > 0 ? updated : undefined
    };
    this.persist();
    this.emit('google-accounts-changed', this.getGoogleAccounts());
    return true;
  }

  clearTokens(reason: string = 'manual'): void {
    if (!this.tokens) return;
    log.info('[TokenManager] clearTokens (%s)', reason);
    this.tokens = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.persist();
    this.emit('signed-out', { reason });
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  getState(): StoredTokens | null {
    return this.tokens;
  }

  getGoogleAccounts(): Array<Omit<StoredGoogleAccount, 'accessToken' | 'refreshToken'>> {
    return Object.values(this.getGoogleAccountsMap(true)).map(
      ({ accessToken: _accessToken, refreshToken: _refreshToken, ...account }) => account
    );
  }

  async getGoogleAccountAccessToken(
    uid: string
  ): Promise<{ accessToken: string; expiresAt: number }> {
    if (!this.tokens) throw new Error('Not signed in');
    const account = this.getGoogleAccountsMap(true)[uid];
    if (!account) throw new Error(`No Google account token found for ${uid}`);
    if (account.expiresAt > Date.now() + 5_000) {
      return { accessToken: account.accessToken, expiresAt: account.expiresAt };
    }
    const refreshed = await this.refreshGoogleAccount(account);
    return { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
  }

  setActiveUid(uid: string | null): void {
    this.activeUid = uid;
  }

  getActiveUid(): string | null {
    return this.activeUid;
  }

  // ---------- Refresh ----------

  /**
   * Force a refresh round-trip against the backend, regardless of expiry.
   * Coalesces concurrent callers onto a single in-flight request.
   */
  async refresh(): Promise<StoredTokens> {
    if (!this.tokens) throw new Error('Not signed in');
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<StoredTokens> {
    if (!this.tokens) throw new Error('Not signed in');
    return this.tokens.provider === 'google' ? this.doGoogleRefresh() : this.doBackendRefresh();
  }

  private async doGoogleRefresh(): Promise<StoredTokens> {
    const refreshToken = this.tokens!.refreshToken;
    const clientId = (import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (import.meta.env.MONO_ENV_GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId) throw new Error('MONO_ENV_GOOGLE_CLIENT_ID not configured');

    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    if (clientSecret) params.set('client_secret', clientSecret);

    const response = await net.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      this.clearTokens('google-refresh-rejected');
      throw new Error(`Google refresh rejected: ${response.status}`);
    }
    if (!response.ok) throw new Error(`Google refresh failed: ${response.status}`);

    const body = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!body.access_token) throw new Error('Google refresh response missing access_token');

    this.saveTokens({
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresInSec: body.expires_in,
      member: this.tokens!.member,
      provider: 'google'
    });
    return this.tokens!;
  }

  private async refreshGoogleAccount(account: StoredGoogleAccount): Promise<StoredGoogleAccount> {
    const clientId = (import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (import.meta.env.MONO_ENV_GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId) throw new Error('MONO_ENV_GOOGLE_CLIENT_ID not configured');

    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token'
    });
    if (clientSecret) params.set('client_secret', clientSecret);

    const response = await net.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) throw new Error(`Google account refresh failed: ${response.status}`);
    const body = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!body.access_token) throw new Error('Google refresh response missing access_token');

    const refreshed: StoredGoogleAccount = {
      ...account,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? account.refreshToken,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000
    };
    this.tokens = {
      ...this.tokens!,
      googleAccounts: {
        ...(this.tokens!.googleAccounts ?? {}),
        [refreshed.uid]: refreshed
      }
    };

    if (this.tokens.member?.uid === refreshed.uid) {
      this.tokens = {
        ...this.tokens,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt
      };
      this.scheduleAutoRefresh();
      this.emit('token-changed', this.tokens);
    }

    this.persist();
    this.emit('google-accounts-changed', this.getGoogleAccounts());
    return refreshed;
  }

  private async doBackendRefresh(): Promise<StoredTokens> {
    const refreshToken = this.tokens!.refreshToken;
    const backend = resolveBackendUrl();
    if (!backend) throw new Error('MONO_ENV_BACKEND_URL not configured');

    const response = await net.fetch(`${backend}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (response.status === 401 || response.status === 403) {
      this.clearTokens('refresh-rejected');
      throw new Error(`Refresh rejected: ${response.status}`);
    }
    if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);

    const body = (await response.json()) as {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
    };
    if (!body.accessToken) throw new Error('Refresh response missing accessToken');

    this.saveTokens({
      accessToken: body.accessToken,
      refreshToken: body.refreshToken ?? refreshToken,
      expiresInSec: body.expiresIn,
      member: this.tokens!.member
    });
    return this.tokens!;
  }

  private scheduleAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (!this.tokens) return;
    const wait = Math.max(
      this.tokens.expiresAt - Date.now() - REFRESH_LEAD_MS,
      MIN_REFRESH_INTERVAL_MS
    );
    this.refreshTimer = setTimeout(() => {
      this.refresh().catch((err) => {
        log.error('[TokenManager] auto-refresh failed:', (err as Error).message);
        // Re-arm a slow retry so a transient backend outage doesn't permanently
        // disable refresh. Real network recovery typically unsticks within a minute.
        this.refreshTimer = setTimeout(() => this.scheduleAutoRefresh(), 30_000);
      });
    }, wait);
  }
}

export function resolveBackendUrl(): string {
  const explicit = (import.meta.env.MONO_ENV_BACKEND_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return (import.meta.env.MONO_ENV_API_URL || '').trim().replace(/\/$/, '');
}

export const tokenManager = TokenManager.getInstance();
