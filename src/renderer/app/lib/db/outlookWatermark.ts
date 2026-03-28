// Outlook History Watermark Cache
// For each Outlook account, store: outlook:history:watermark:<accountId> → the last historyId returned by the server

import { monoLocalStorageDb } from './localStorage';

const OUTLOOK_WATERMARK_PREFIX = 'outlook:history:watermark:';

export interface OutlookWatermark {
  accountId: string;
  historyId: string;
  lastUpdatedAt: number;
}

/**
 * Save the Outlook watermark (historyId) for an account
 * Always update it after every successful call.
 */
export async function saveOutlookWatermark(accountId: string, historyId: string): Promise<void> {
  if (!accountId || !historyId) {
    console.warn('saveOutlookWatermark: Invalid accountId or historyId', { accountId, historyId });
    return;
  }

  const watermark: OutlookWatermark = {
    accountId,
    historyId,
    lastUpdatedAt: Date.now()
  };

  const key = `${OUTLOOK_WATERMARK_PREFIX}${accountId}`;
  await monoLocalStorageDb.setItem(key, watermark);

  console.log(`Saved Outlook watermark for account ${accountId}: ${historyId}`);
}

/**
 * Get the stored Outlook watermark (historyId) for an account
 */
export async function getOutlookWatermark(accountId: string): Promise<OutlookWatermark | null> {
  if (!accountId) {
    console.warn('getOutlookWatermark: Invalid accountId', { accountId });
    return null;
  }

  const key = `${OUTLOOK_WATERMARK_PREFIX}${accountId}`;
  try {
    const watermark = await monoLocalStorageDb.getItem<OutlookWatermark>(key);

    if (watermark) {
      console.log(`Retrieved Outlook watermark for account ${accountId}: ${watermark.historyId}`);
      return watermark;
    }

    console.log(`No Outlook watermark found for account ${accountId}`);
    return null;
  } catch (error) {
    console.error(`Error getting Outlook watermark for account ${accountId}:`, error);
    return null;
  }
}

/**
 * Clear the Outlook watermark for an account
 * Useful when forcing a full sync or handling errors
 */
export async function clearOutlookWatermark(accountId: string): Promise<void> {
  if (!accountId) {
    console.warn('clearOutlookWatermark: Invalid accountId', { accountId });
    return;
  }

  const key = `${OUTLOOK_WATERMARK_PREFIX}${accountId}`;
  await monoLocalStorageDb.removeItem(key);

  console.log(`Cleared Outlook watermark for account ${accountId}`);
}

/**
 * Get all Outlook watermarks (useful for debugging or cleanup)
 */
export async function getAllOutlookWatermarks(): Promise<OutlookWatermark[]> {
  // Note: This is a simple implementation. In a real scenario, you might want to
  // iterate through all keys with the prefix, but IndexedDB doesn't have a direct
  // way to do this without knowing the account IDs
  console.warn(
    'getAllOutlookWatermarks: Not implemented - would need to track account IDs separately'
  );
  return [];
}

