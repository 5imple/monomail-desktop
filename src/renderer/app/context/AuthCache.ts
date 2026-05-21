import { MonoAccount, MonoMember, UserPreference } from '@/main/api/auth/types';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';

interface CachedAuthData {
  idToken: string | null;
  accounts: MonoAccount[];
  member: MonoMember | null;
  preference: UserPreference | null;
  relatedMembers?: Array<MonoMember>; // Optional for backward compatibility
  timestamp: number;
}

/**
 * Simple authentication cache manager to prevent unnecessary logouts
 * during network changes/disconnections
 */
export class AuthCache {
  private static INSTANCE: AuthCache;
  private readonly CACHE_KEY = 'cache:auth:data';
  private readonly TOKEN_EXPIRY_MS = 55 * 60 * 1000; // 55 minutes (Firebase tokens last 1 hour)

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): AuthCache {
    if (!AuthCache.INSTANCE) {
      AuthCache.INSTANCE = new AuthCache();
    }
    return AuthCache.INSTANCE;
  }

  /**
   * Save authentication data to cache
   */
  public async saveAuthData(data: {
    idToken: string | null;
    accounts: MonoAccount[];
    member: MonoMember | null;
    preference: UserPreference | null;
    relatedMembers?: Array<MonoMember>;
  }): Promise<void> {
    try {
      const cacheData: CachedAuthData = {
        ...data,
        relatedMembers: data.relatedMembers || [],
        timestamp: Date.now()
      };

      await monoLocalStorageDb.setItem(this.CACHE_KEY, cacheData);
    } catch (error) {
      console.error('Failed to cache auth data:', error);
    }
  }

  /**
   * Get cached authentication data
   */
  public async getCachedData(): Promise<CachedAuthData | null> {
    try {
      const cacheData = await monoLocalStorageDb.getItem<CachedAuthData>(this.CACHE_KEY);
      if (cacheData) {
        // Ensure backward compatibility for cache entries that might not have relatedMembers
        return {
          ...cacheData,
          relatedMembers: cacheData.relatedMembers || []
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to read cached auth data:', error);
      return null;
    }
  }

  /**
   * Clear the auth cache (typically on explicit sign out)
   */
  public async clearCache(): Promise<void> {
    try {
      await monoLocalStorageDb.removeItem(this.CACHE_KEY);
    } catch (error) {
      console.error('Failed to clear auth cache:', error);
    }
  }

  /**
   * Check if we have valid cached credentials
   */
  public async hasCachedCredentials(): Promise<boolean> {
    const cache = await this.getCachedData();
    return (
      cache !== null &&
      cache.accounts.length > 0 &&
      !!cache.idToken &&
      Date.now() - cache.timestamp < this.TOKEN_EXPIRY_MS
    );
  }

  /**
   * Check if cached token is getting stale and should be refreshed immediately
   * Returns true if token is older than 30 minutes (should refresh proactively)
   */
  public async isTokenStale(): Promise<boolean> {
    const cache = await this.getCachedData();
    if (!cache || !cache.idToken) {
      return true; // No token means definitely stale
    }

    const TOKEN_STALE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    return Date.now() - cache.timestamp > TOKEN_STALE_THRESHOLD;
  }

  /**
   * Check if cached data indicates account selection is needed
   */
  public async needsAccountSelection(): Promise<boolean> {
    const cache = await this.getCachedData();
    return cache !== null && !!cache.relatedMembers && cache.relatedMembers.length > 0;
  }

  /**
   * Update only the preference in the cached data
   */
  public async updateCachedPreference(preference: UserPreference): Promise<void> {
    try {
      const cachedData = await this.getCachedData();
      if (cachedData) {
        const updatedCacheData: CachedAuthData = {
          ...cachedData,
          preference,
          timestamp: Date.now() // Update timestamp to reflect the change
        };

        await monoLocalStorageDb.setItem(this.CACHE_KEY, updatedCacheData);
      } else {
        console.warn('No cached data found to update preference');
      }
    } catch (error) {
      console.error('Failed to update cached preference:', error);
    }
  }
}

// Export a singleton instance
export const authCache = AuthCache.getInstance();
