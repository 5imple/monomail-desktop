class AuthManager {
  private static instance: AuthManager;
  private activeUid: string | null = null;
  private idToken: string | null = null;

  private constructor() {
    //
  }

  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  setIdToken(token: string | null): void {
    this.idToken = token;
  }

  getIdToken(): string | null {
    return this.idToken;
  }

  clearIdToken(): void {
    this.idToken = null;
  }
  setActiveUid(uid: string): void {
    this.activeUid = uid;
  }

  getActiveUid(): string | null {
    return this.activeUid;
  }

  clearActiveUid(): void {
    this.activeUid = null;
  }
}

export const authManager = AuthManager.getInstance();
