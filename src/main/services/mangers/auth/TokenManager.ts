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
   * Which auth provider issued these tokens. 'google' / 'microsoft' = PKCE
   * direct OAuth; undefined / 'backend' = legacy backend-proxied flow.
   * Controls which refresh endpoint doRefresh() calls.
   */
  provider?: MailProvider | 'backend';
  /**
   * @deprecated Pre-provider-neutral blobs stored per-account tokens here.
   * Parsed once on load, migrated into `mailAccounts`, never written back.
   */
  googleAccounts?: Record<string, StoredGoogleAccount>;
  /**
   * Direct-OAuth mode needs one token set per mail account (any provider).
   * The top-level token remains the signed-in session; this map lets mail
   * calls resolve the correct bearer token for each account uid.
   */
  mailAccounts?: Record<string, StoredMailAccount>;
}

/** Legacy per-account shape (no provider tag) — kept only to parse old blobs. */
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

export type MailProvider = 'google' | 'microsoft';

export interface StoredMailAccount {
  uid: string;
  provider: MailProvider;
  email: string;
  displayName?: string;
  photoURL?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  /** Set when the provider rejected the refresh token — interactive re-auth required. */
  authError?: boolean;
  /** Provider-specific identity metadata (Microsoft: tenant/object ids). */
  providerMeta?: {
    tenantId?: string;
    objectId?: string;
    userPrincipalName?: string;
  };
}

/** Account shape safe to hand to the renderer (no token material). */
export type PublicMailAccount = Omit<StoredMailAccount, 'accessToken' | 'refreshToken'>;

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

// v1 Microsoft delegated scopes — mail only. Calendar/contacts are explicit
// non-goals for v1 (docs/MICROSOFT_365_SUPPORT_PLAN.md Phase 14).
const DIRECT_MICROSOFT_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send'
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
      this.migrateLegacyGoogleAccounts();
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

  /**
   * One-time migration: pre-provider-neutral blobs stored per-account tokens
   * under `googleAccounts`. Fold them into `mailAccounts` (tagged
   * provider:'google') and stop writing the legacy field — old blobs keep
   * parsing, new blobs only carry mailAccounts.
   */
  private migrateLegacyGoogleAccounts(): void {
    if (!this.tokens?.googleAccounts) return;
    const migrated: Record<string, StoredMailAccount> = { ...(this.tokens.mailAccounts ?? {}) };
    for (const [uid, legacy] of Object.entries(this.tokens.googleAccounts)) {
      if (!migrated[uid]) migrated[uid] = { ...legacy, provider: 'google' };
    }
    this.tokens = { ...this.tokens, googleAccounts: undefined, mailAccounts: migrated };
    this.persist();
    log.info(
      '[TokenManager] migrated %d legacy Google account(s) into mailAccounts',
      Object.keys(migrated).length
    );
  }

  private toStoredMailAccount(args: {
    provider: MailProvider;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    member: NonNullable<StoredTokens['member']>;
    scopes?: string[];
    providerMeta?: StoredMailAccount['providerMeta'];
  }): StoredMailAccount {
    return {
      uid: args.member.uid,
      provider: args.provider,
      email: args.member.email,
      displayName: args.member.displayName,
      photoURL: args.member.photoURL,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scopes:
        args.scopes ??
        (args.provider === 'microsoft' ? DIRECT_MICROSOFT_SCOPES : DIRECT_GOOGLE_SCOPES),
      providerMeta: args.providerMeta
    };
  }

  private getMailAccountsMap(seedCurrent = false): Record<string, StoredMailAccount> {
    const accounts = { ...(this.tokens?.mailAccounts ?? {}) };
    const sessionProvider = this.tokens?.provider;
    if (
      seedCurrent &&
      (sessionProvider === 'google' || sessionProvider === 'microsoft') &&
      this.tokens?.member &&
      !accounts[this.tokens.member.uid]
    ) {
      accounts[this.tokens.member.uid] = this.toStoredMailAccount({
        provider: sessionProvider,
        accessToken: this.tokens.accessToken,
        refreshToken: this.tokens.refreshToken,
        expiresAt: this.tokens.expiresAt,
        member: this.tokens.member
      });
    }
    return accounts;
  }

  private emitAccountsChanged(): void {
    this.emit('google-accounts-changed', this.getGoogleAccounts());
    this.emit('mail-accounts-changed', this.getMailAccounts());
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
    const isDirectProvider = input.provider === 'google' || input.provider === 'microsoft';
    let mailAccounts = isDirectProvider
      ? this.getMailAccountsMap(true)
      : this.tokens?.mailAccounts; // preserve secondary accounts across backend token refreshes
    if (isDirectProvider && input.member) {
      // Merge over the existing entry so scopes/providerMeta captured at
      // sign-in survive session-level refreshes.
      const existing = mailAccounts?.[input.member.uid];
      mailAccounts = {
        ...(mailAccounts ?? {}),
        [input.member.uid]: this.toStoredMailAccount({
          provider: input.provider as MailProvider,
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          expiresAt,
          member: input.member,
          scopes: existing?.scopes,
          providerMeta: existing?.providerMeta
        })
      };
    }
    this.tokens = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
      member: input.member,
      provider: input.provider ?? this.tokens?.provider ?? 'backend',
      mailAccounts
    };
    this.persist();
    this.scheduleAutoRefresh();
    this.emit('token-changed', this.tokens);
  }

  saveMailAccountTokens(input: {
    provider: MailProvider;
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
    expiresAt?: number;
    member: NonNullable<StoredTokens['member']>;
    scopes?: string[];
    providerMeta?: StoredMailAccount['providerMeta'];
  }): StoredMailAccount {
    if (!this.tokens) throw new Error('Not signed in');
    const expiresAt =
      input.expiresAt ??
      (input.expiresInSec != null ? Date.now() + input.expiresInSec * 1000 : Date.now() + 3600_000);
    const existing = this.getMailAccountsMap(true)[input.member.uid];
    const account = this.toStoredMailAccount({
      provider: input.provider,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
      member: input.member,
      scopes: input.scopes ?? existing?.scopes,
      providerMeta: input.providerMeta ?? existing?.providerMeta
    });
    this.tokens = {
      ...this.tokens,
      mailAccounts: {
        ...this.getMailAccountsMap(true),
        [account.uid]: account
      }
    };
    this.persist();
    this.emitAccountsChanged();
    return account;
  }

  /** @deprecated Use saveMailAccountTokens — kept for the Google add-account flow during migration. */
  saveGoogleAccountTokens(input: {
    accessToken: string;
    refreshToken: string;
    expiresInSec?: number;
    expiresAt?: number;
    member: NonNullable<StoredTokens['member']>;
  }): StoredMailAccount {
    return this.saveMailAccountTokens({ ...input, provider: 'google' });
  }

  removeMailAccount(uid: string): boolean {
    const accounts = this.getMailAccountsMap(true);
    if (!accounts[uid]) return false;
    if (this.tokens?.member?.uid === uid) return false; // primary account — must sign out instead
    const updated = { ...accounts };
    delete updated[uid];
    this.tokens = {
      ...this.tokens!,
      mailAccounts: Object.keys(updated).length > 0 ? updated : undefined
    };
    this.persist();
    this.emitAccountsChanged();
    return true;
  }

  /** @deprecated Use removeMailAccount. */
  removeGoogleAccount(uid: string): boolean {
    return this.removeMailAccount(uid);
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

  getMailAccounts(): PublicMailAccount[] {
    return Object.values(this.getMailAccountsMap(true)).map(
      ({ accessToken: _accessToken, refreshToken: _refreshToken, ...account }) => account
    );
  }

  /** @deprecated Google-provider subset; use getMailAccounts. */
  getGoogleAccounts(): PublicMailAccount[] {
    return this.getMailAccounts().filter((account) => account.provider === 'google');
  }

  async getMailAccountAccessToken(
    uid: string
  ): Promise<{ accessToken: string; expiresAt: number }> {
    if (!this.tokens) throw new Error('Not signed in');
    const account = this.getMailAccountsMap(true)[uid];
    if (!account) throw new Error(`No mail account token found for ${uid}`);
    if (account.expiresAt > Date.now() + 5_000) {
      return { accessToken: account.accessToken, expiresAt: account.expiresAt };
    }
    const refreshed = await this.refreshMailAccount(account);
    return { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
  }

  /**
   * @deprecated Use getMailAccountAccessToken. Google-only resolution for the
   * Gmail/People/Calendar IPC paths — throws for non-Google uids so a Google
   * API call can never be issued with a Microsoft bearer token.
   */
  async getGoogleAccountAccessToken(
    uid: string
  ): Promise<{ accessToken: string; expiresAt: number }> {
    if (!this.tokens) throw new Error('Not signed in');
    const account = this.getMailAccountsMap(true)[uid];
    if (!account || account.provider !== 'google') {
      throw new Error(`No Google account token found for ${uid}`);
    }
    return this.getMailAccountAccessToken(uid);
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
    if (this.tokens.provider === 'google') return this.doGoogleRefresh();
    if (this.tokens.provider === 'microsoft') return this.doMicrosoftSessionRefresh();
    return this.doBackendRefresh();
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

  /** Refresh a single mail account's tokens, dispatching on its provider. */
  async refreshMailAccount(accountOrUid: StoredMailAccount | string): Promise<StoredMailAccount> {
    const account =
      typeof accountOrUid === 'string'
        ? this.getMailAccountsMap(true)[accountOrUid]
        : accountOrUid;
    if (!account) throw new Error(`No mail account token found for ${String(accountOrUid)}`);
    return account.provider === 'microsoft'
      ? this.refreshMicrosoftAccount(account)
      : this.refreshGoogleAccount(account);
  }

  /**
   * Write a refreshed account back into the store, mirroring into the
   * session-level tokens when it is the primary (member) account.
   */
  private commitRefreshedAccount(refreshed: StoredMailAccount): StoredMailAccount {
    this.tokens = {
      ...this.tokens!,
      mailAccounts: {
        ...(this.tokens!.mailAccounts ?? {}),
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
    this.emitAccountsChanged();
    return refreshed;
  }

  private async refreshGoogleAccount(account: StoredMailAccount): Promise<StoredMailAccount> {
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

    return this.commitRefreshedAccount({
      ...account,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? account.refreshToken,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      authError: undefined
    });
  }

  private async refreshMicrosoftAccount(account: StoredMailAccount): Promise<StoredMailAccount> {
    const clientId = (import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim();
    const tenant = (import.meta.env.MONO_ENV_MICROSOFT_TENANT || '').trim() || 'organizations';
    if (!clientId) throw new Error('MONO_ENV_MICROSOFT_CLIENT_ID not configured');

    // Public client — no client_secret. `scope` is sent on refresh so the
    // returned access token carries the delegated scopes.
    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: account.refreshToken,
      grant_type: 'refresh_token',
      scope: (account.scopes.length > 0 ? account.scopes : DIRECT_MICROSOFT_SCOPES).join(' ')
    });

    const response = await net.fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      }
    );

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      // invalid_grant / revoked: this account needs interactive re-auth. Mark
      // it (renderer can surface a reconnect) but do NOT clear the session —
      // other accounts keep working.
      this.commitRefreshedAccount({ ...account, authError: true });
      throw new Error(`Microsoft account refresh rejected: ${response.status}`);
    }
    if (!response.ok) throw new Error(`Microsoft account refresh failed: ${response.status}`);

    const body = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };
    if (!body.access_token) throw new Error('Microsoft refresh response missing access_token');

    // Microsoft ROTATES the refresh token on every redemption: the response
    // carries a NEW RT with renewed lifetime and the old one must be
    // discarded. Persisting it here is mandatory — dropping it strands the
    // account when the old RT is invalidated.
    return this.commitRefreshedAccount({
      ...account,
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? account.refreshToken,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
      authError: undefined
    });
  }

  /**
   * Session-level refresh for a Microsoft-primary session: refresh the
   * member's mail account (which mirrors into the session tokens) and sign
   * out if the provider rejected the refresh token, matching the Google
   * session-refresh policy.
   */
  private async doMicrosoftSessionRefresh(): Promise<StoredTokens> {
    const member = this.tokens!.member;
    const account = member ? this.getMailAccountsMap(true)[member.uid] : undefined;
    if (!account) {
      this.clearTokens('microsoft-refresh-no-account');
      throw new Error('Microsoft session has no matching mail account');
    }
    try {
      await this.refreshMicrosoftAccount(account);
    } catch (e) {
      if (this.tokens && this.getMailAccountsMap()[account.uid]?.authError) {
        this.clearTokens('microsoft-refresh-rejected');
      }
      throw e;
    }
    return this.tokens!;
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
