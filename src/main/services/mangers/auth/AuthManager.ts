import { tokenManager } from '@/main/services/mangers/auth/TokenManager';

/**
 * Thin compatibility facade over TokenManager. Pre-Phase-B this class kept
 * the active session in-memory; now the source of truth is TokenManager,
 * which persists encrypted on disk and owns refresh.
 *
 * Kept as a separate export so existing call sites (apiClient, app-events,
 * tray) don't need to know about persistence — they just ask
 * `authManager.getIdToken()` like before.
 */
class AuthManager {
  private static instance: AuthManager;

  private constructor() {
    //
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * @deprecated The renderer no longer pushes tokens to main — tokens
   * arrive via the OAuth deep-link and live in TokenManager. This setter
   * is a no-op kept so the legacy `main:auth:set-id-token` IPC channel
   * stays addressable until the renderer is updated.
   */
  setIdToken(_token: string | null): void {
    /* no-op */
  }

  getIdToken(): string | null {
    return tokenManager.getAccessToken();
  }

  clearIdToken(): void {
    tokenManager.clearTokens('authManager.clearIdToken');
  }

  setActiveUid(uid: string | null): void {
    tokenManager.setActiveUid(uid);
  }

  getActiveUid(): string | null {
    return tokenManager.getActiveUid();
  }

  clearActiveUid(): void {
    tokenManager.setActiveUid(null);
  }
}

export const authManager = AuthManager.getInstance();
