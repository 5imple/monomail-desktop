import { monoLocalStorageDb } from '../db/localStorage';

interface CacheConfig {
  key: string;
  ttl?: number; // Time to live in milliseconds
  useHash?: boolean; // Whether to hash the data for security
}

/**
 * Generate SHA-256 hash of data using Web Crypto API
 */
async function generateHash(data: any): Promise<string> {
  const msgBuffer = new TextEncoder().encode(JSON.stringify(data));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Network-first caching strategy
 * Tries to fetch from network first, falls back to cache if network fails
 */
export async function networkFirstCache<T>(
  config: CacheConfig,
  networkFetch: () => Promise<T>
): Promise<T> {
  try {
    // Try network first
    const data = await networkFetch();

    // Cache the successful response
    const cacheData = config.useHash
      ? {
          data,
          hash: await generateHash(data),
          timestamp: Date.now()
        }
      : {
          data,
          timestamp: Date.now()
        };

    await monoLocalStorageDb.setItem(config.key, cacheData);

    return data;
  } catch (error) {
    console.warn(`Network fetch failed for ${config.key}, trying cache...`, error);

    // If network fails, try to get from cache
    const cached = await monoLocalStorageDb.getItem<{
      data: T;
      hash?: string;
      timestamp: number;
    }>(config.key);

    if (cached) {
      // Check if cache is still valid based on TTL
      if (config.ttl && Date.now() - cached.timestamp > config.ttl) {
        console.warn(`Cache expired for ${config.key}`);
        throw error; // Re-throw the original network error
      }

      // If hash is enabled, verify the data integrity
      if (config.useHash && cached.hash) {
        const currentHash = await generateHash(cached.data);
        if (currentHash !== cached.hash) {
          console.warn(`Cache hash mismatch for ${config.key}, cache invalidated`);
          await monoLocalStorageDb.removeItem(config.key);
          throw error;
        }
      }

      return cached.data;
    }

    // If no cache or cache expired, throw the original error
    throw error;
  }
}

// Cache keys
export const CACHE_KEYS = {
  USER_INFO: 'cache:user:info',
  USER_PREFERENCE: 'cache:user:preference',
  SPACES: 'cache:space:spaces',
  LABELS: 'cache:label:labels',
  BILLING_INFO: 'cache:billing:info'
} as const;

// Cache TTLs (in milliseconds)
export const CACHE_TTL = {
  USER_INFO: 24 * 60 * 60 * 1000, // 24 hours
  SPACES: 24 * 60 * 60 * 1000, // 24 hours
  LABELS: 12 * 60 * 60 * 1000, // 12 hours
  USER_PREFERENCE: 24 * 60 * 60 * 1000, // 24 hours
  BILLING_INFO: 12 * 60 * 60 * 1000 // 30 minutes
} as const;
