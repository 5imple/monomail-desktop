// src/renderer/app/lib/db/sync.ts

import { MonoThread } from '@/main/models/thread/MonoThread';
import { initDB } from '../db';

// Interface for storing account sync metadata
export interface AccountSyncHistoryMeta {
  accountId: string;
  historyId: string;
  lastUpdatedAt: number; // timestamp
  lastSyncQuery?: string;
}

/**
 * Save the sync metadata for an account
 */
export async function DBSaveSyncHistoryMeta(
  accountId: string,
  meta: Partial<AccountSyncHistoryMeta>
): Promise<void> {
  if (!accountId) return;

  const db = await initDB(accountId);
  const tx = db.transaction(['syncHistoryMeta'], 'readwrite');
  const syncHistoryMetaStore = tx.objectStore('syncHistoryMeta');

  // Get existing data or create new
  const existing = (await syncHistoryMetaStore.get('accountMeta')) || {
    accountId,
    historyId: '',
    lastUpdatedAt: 0
  };

  // Merge with new data
  const updated = {
    ...existing,
    ...meta,
    // Always update these fields
    accountId,
    lastUpdatedAt: meta.lastUpdatedAt || Date.now()
  };

  await syncHistoryMetaStore.put(updated, 'accountMeta');
  await tx.done;
}

/**
 * Get the sync metadata for an account
 */
export async function DBGetSyncHistoryMeta(
  accountId: string
): Promise<AccountSyncHistoryMeta | null> {
  if (!accountId) return null;

  try {
    const db = await initDB(accountId);
    const tx = db.transaction(['syncHistoryMeta'], 'readonly');
    const syncHistoryMetaStore = tx.objectStore('syncHistoryMeta');

    const meta = await syncHistoryMetaStore.get('accountMeta');
    await tx.done;

    return meta || null;
  } catch (error) {
    console.error(`Error getting sync metadata for account ${accountId}:`, error);
    return null;
  }
}

/**
 * Update the historyId for an account based on the most recent thread
 */
export async function updateHistoryIdFromThread(
  accountId: string,
  thread: MonoThread
): Promise<void> {
  if (!thread || !thread.historyId) return;

  await DBSaveSyncHistoryMeta(accountId, {
    historyId: thread.historyId,
    lastUpdatedAt: Date.now()
  });
}
