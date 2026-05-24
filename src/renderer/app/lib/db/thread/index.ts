import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { updateContactForMessage } from '@/renderer/app/lib/db/contact/utils';
import { fetchAndConstructThread } from '@/renderer/app/lib/db/thread/utils';
import { initDB } from '../db';
import { UserPreference } from '@/main/api/auth/types/user';
import { authCache } from '@/renderer/app/context/AuthCache';

export type ValidLabel =
  | 'INBOX'
  | 'IMPORTANT'
  | 'DRAFT'
  | 'STARRED'
  | 'SENT'
  | 'SNOOZED'
  | 'PRIMARY'
  | 'PROMOTIONS'
  | 'UPDATES'
  | 'SOCIAL'
  | 'FORUMS';

export const validLabels: ValidLabel[] = [
  'INBOX',
  'IMPORTANT',
  'DRAFT',
  'STARRED',
  'SENT',
  'SNOOZED',
  'PRIMARY',
  'PROMOTIONS',
  'UPDATES',
  'SOCIAL',
  'FORUMS'
];

// Helper function to get the Gmail label for a category
const getCategoryLabel = (category: string): string => {
  switch (category.toUpperCase()) {
    case 'PRIMARY':
      return 'CATEGORY_PERSONAL';
    case 'SOCIAL':
      return 'CATEGORY_SOCIAL';
    case 'PROMOTIONS':
      return 'CATEGORY_PROMOTIONS';
    case 'UPDATES':
      return 'CATEGORY_UPDATES';
    case 'FORUMS':
      return 'CATEGORY_FORUMS';
    default:
      return category.toUpperCase();
  }
};

// Helper function to check if a thread belongs to the primary category
export const isPrimaryThread = (thread: MonoThread, preference: UserPreference): boolean => {
  const showSocial = preference.display.inbox.category?.[thread.accountId]?.showSocial ?? true;
  const showPromotions =
    preference.display.inbox.category?.[thread.accountId]?.showPromotions ?? true;
  const showUpdates = preference.display.inbox.category?.[thread.accountId]?.showUpdates ?? true;
  const showForums = preference.display.inbox.category?.[thread.accountId]?.showForums ?? true;

  const labelIds = thread.labelIds;

  // A thread is in Primary if either:
  // 1. It has the CATEGORY_PERSONAL label, or
  // 2. It has INBOX but none of the other category labels

  if (thread.from.some((from) => from.email && from.email.includes('github.com'))) {
    return false;
  }

  if (labelIds.includes('INBOX')) {
    if (labelIds.includes('CATEGORY_PERSONAL')) {
      return true;
    }

    const hasOtherCategory = labelIds.some((label: string) =>
      [
        showSocial ? null : 'CATEGORY_SOCIAL',
        showPromotions ? null : 'CATEGORY_PROMOTIONS',
        showForums ? null : 'CATEGORY_FORUMS',
        showUpdates ? null : 'CATEGORY_UPDATES'
      ]
        .filter(Boolean)
        .includes(label)
    );
    return !hasOtherCategory;
  }

  return false;
};

export async function DBSaveThread(uid: string, thread: MonoThread) {
  // Existing implementation...
  const db = await initDB(uid);

  const { id: threadId, timestamp, items } = thread;

  const tx = db.transaction(['threads', 'contacts', 'messages', 'drafts'], 'readwrite');
  const threadsStore = tx.objectStore('threads');
  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');

  // Check if thread already exists
  const existingThread = await threadsStore.get(threadId);
  const existingDraft = await draftsStore.index('byThreadId').getAll(threadId);

  let mergedItems = [...items.map((item) => item.id).filter(Boolean)];

  if (existingThread) {
    // Merge items from the existing thread
    const existingItems = existingThread.items || [];
    mergedItems = Array.from(new Set([...mergedItems, ...existingItems]));
  }

  if (existingDraft.length > 0) {
    const existingDrafts = existingDraft.map((draft) => draft.id);
    thread.labelIds = [...new Set([...thread.labelIds, ...['DRAFT']])];
    mergedItems = Array.from(new Set([...mergedItems, ...existingDrafts]));
  }
  const threadItems = {
    ...thread,
    accountId: uid,
    items: mergedItems
  };

  // Save the thread
  await threadsStore.put(threadItems);

  // Process each message in the thread to add or update contacts
  for (const item of items) {
    if (item.type === 'message') {
      const message = item as MonoMessage;
      await messagesStore.put(message.toPlainObject());
      await updateContactForMessage(tx, uid, message, threadId);
    }
  }

  // Save any additional item types (e.g., comments) here if needed

  await tx.done;
}

export async function DBSaveThreads(uid: string, threads: MonoThread[]) {
  for (const thread of threads) {
    await DBSaveThread(uid, thread);
  }
}

export async function DBGetThread(uid: string, threadId: string): Promise<MonoThread | null> {
  // Existing implementation...
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
  const threadsStore = tx.objectStore('threads');

  const threadData = await threadsStore.get(threadId);
  if (!threadData) return null;

  // Use the utility function to construct the thread
  return fetchAndConstructThread(tx, threadData, uid);
}

export async function DBGetTargetThread(uid: string, targetEmail?: string): Promise<MonoThread[]> {
  // Existing implementation...
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
  const threadsStore = tx.objectStore('threads');

  const threadData = await threadsStore.getAll();
  let filteredThreadData = threadData;

  if (targetEmail) {
    filteredThreadData = threadData.filter(
      (v: MonoThread) =>
        v.from
          .concat(v.cc, v.bcc)
          .map((v) => v.email)
          .filter((email) => email.includes(targetEmail)).length > 0
    );
  }

  // Construct the threads with full message objects
  const threads = await Promise.all(
    filteredThreadData.map(async (threadData) => {
      if (!threadData || threadData.labelIds.includes('TRASH')) return null;
      // Use the utility function to construct the thread
      return fetchAndConstructThread(tx, threadData, uid);
    })
  );

  return threads.filter((thread): thread is MonoThread => thread !== null);
}

export async function DBRemoveThread(uid: string, threadId: string) {
  // Existing implementation...
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readwrite');
  const threadsStore = tx.objectStore('threads');
  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');

  const threadData = await threadsStore.get(threadId);
  if (!threadData) {
    console.error(`Thread ${threadId} not found`);
    return;
  }
  // Delete all items in the thread
  for (const itemId of threadData.items) {
    await messagesStore.delete(itemId);
    await draftsStore.delete(itemId);
  }

  // Delete the thread itself
  await threadsStore.delete(threadId);

  await tx.done;
}

/**
 * Remove stale stub threads (ids prefixed `mock-`) left in the cache by an
 * earlier backend-backed build / mock backend. The inbox renders from this
 * cache, so these stubs keep showing — and reappear after a delete — even
 * though the app now reads mail directly from Gmail. Safe to call repeatedly;
 * returns the number of threads removed.
 */
export async function DBPurgeStubThreads(uid: string): Promise<number> {
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readwrite');
  const threadsStore = tx.objectStore('threads');
  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');

  const all = await threadsStore.getAll();
  let removed = 0;
  for (const threadData of all) {
    if (typeof threadData?.id === 'string' && threadData.id.startsWith('mock-')) {
      for (const itemId of threadData.items ?? []) {
        await messagesStore.delete(itemId);
        await draftsStore.delete(itemId);
      }
      await threadsStore.delete(threadData.id);
      removed++;
    }
  }

  await tx.done;
  return removed;
}

/**
 * Strip a single Gmail label token of stray brackets/quotes/whitespace.
 * Backend push frames deliver labels as bracket-wrapped strings (e.g.
 * `"[INBOX, UNREAD]"` or `"[TRASH]"`); a naive comma-split turns those into
 * malformed labels like `"[TRASH]"` that then evade every `includes('TRASH')`
 * filter, so trashed threads never leave the inbox.
 */
export function normalizeLabelToken(raw: string): string {
  return String(raw).replace(/[[\]"']/g, '').trim();
}

/** Normalize a labels value (string | array | bracketed CSV) into clean ids. */
export function normalizeGmailLabels(input: string | string[] | null | undefined): string[] {
  if (!input) return [];
  const tokens = Array.isArray(input) ? input : String(input).split(',');
  const out: string[] = [];
  for (const token of tokens) {
    const clean = normalizeLabelToken(token);
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * One-time repair: normalize already-corrupted labelIds (e.g. `[TRASH]`) on
 * cached threads and messages so the TRASH/SPAM filters work again. Returns the
 * number of records fixed. Safe to call repeatedly.
 */
export async function DBNormalizeCachedLabels(uid: string): Promise<number> {
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages'], 'readwrite');
  let fixed = 0;
  for (const storeName of ['threads', 'messages'] as const) {
    const store = tx.objectStore(storeName);
    const all = await store.getAll();
    for (const rec of all) {
      if (!rec || !Array.isArray(rec.labelIds)) continue;
      const norm = normalizeGmailLabels(rec.labelIds);
      const changed =
        norm.length !== rec.labelIds.length || norm.some((l, i) => l !== rec.labelIds[i]);
      if (changed) {
        rec.labelIds = norm;
        await store.put(rec);
        fixed++;
      }
    }
  }
  await tx.done;
  return fixed;
}

/**
 * Authoritative inbox reconcile. After a full sync of the inbox/primary view
 * returns Gmail's current set, strip the INBOX label from cached threads that
 * are still shown in that view but were NOT returned by Gmail — i.e. they were
 * archived / moved out of the inbox elsewhere. Without this the cache only ever
 * grows: the full sync upserts and never removes, so archived threads linger in
 * the inbox forever and the app drifts from Gmail.
 *
 * `presentIds` MUST be the complete Gmail result for the view (all pages). The
 * thread stays cached (for All Mail / other views); only INBOX is removed.
 */
export async function DBReconcileInboxMembership(
  uid: string,
  presentIds: Set<string>,
  query: string
): Promise<number> {
  const preference = (await authCache.getCachedData())?.preference;
  if (!preference) return 0;
  const isPrimaryView = query === 'category:primary';

  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages'], 'readwrite');
  const threadsStore = tx.objectStore('threads');
  const messagesStore = tx.objectStore('messages');
  const all = await threadsStore.getAll();

  let pruned = 0;
  for (const rec of all) {
    if (!rec || !Array.isArray(rec.labelIds) || !rec.labelIds.includes('INBOX')) continue;
    if (presentIds.has(rec.id)) continue;
    // Only touch threads that actually belong to the synced view (for primary,
    // this also skips github threads, which Gmail's primary query excludes).
    const inSyncedView = isPrimaryView
      ? isPrimaryThread(rec as unknown as MonoThread, preference)
      : true;
    if (!inSyncedView) continue;

    rec.labelIds = rec.labelIds.filter((l: string) => l !== 'INBOX');
    await threadsStore.put(rec);
    for (const itemId of rec.items ?? []) {
      const msg = await messagesStore.get(itemId);
      if (msg && Array.isArray(msg.labelIds) && msg.labelIds.includes('INBOX')) {
        msg.labelIds = msg.labelIds.filter((l: string) => l !== 'INBOX');
        await messagesStore.put(msg);
      }
    }
    pruned++;
  }
  await tx.done;
  return pruned;
}

export async function DBGetThreadsByLabel(
  uid: string,
  label: ValidLabel | string,
  limit: number = 50,
  offset: number = 0
): Promise<MonoThread[]> {
  // Existing implementation...
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
  const threadsStore = tx.objectStore('threads');

  // Use the multiEntry index `byLabelIds` to fetch threads with the specified label
  const threadsMatchingLabel = await threadsStore.index('byLabelIds').getAll(label.toUpperCase());

  // Sort by timestamp in descending order
  const sortedThreads = threadsMatchingLabel
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(offset, offset + limit);

  // Construct the threads
  const threads = await Promise.all(
    sortedThreads.map(async (threadData) => {
      if (!threadData || threadData.labelIds.includes('TRASH')) return null;
      // Use the utility function to construct the thread
      return fetchAndConstructThread(tx, threadData, uid);
    })
  );

  return threads.filter((thread): thread is MonoThread => thread !== null);
}

/**
 * Fetch all threads from multiple user accounts with timestamp-based pagination
 * This is used primarily for handling the "in:all" query
 *
 * @param uids - Array of user IDs to fetch threads from
 * @param limit - Maximum number of threads to return
 * @param lastTimestamp - Timestamp to use for pagination (fetch threads older than this)
 * @returns Promise with array of threads matching the criteria
 */
export async function DBGetAllThreadsMultiUser(
  uids: string[],
  limit: number = 50,
  lastTimestamp?: number
): Promise<MonoThread[]> {
  // Collect all threads from each user ID
  const allThreadPromises = uids.map(async (uid) => {
    const db = await initDB(uid);
    const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
    const threadsStore = tx.objectStore('threads');

    // Get all threads
    const allThreads = await threadsStore.getAll();

    // Filter out trash threads and apply timestamp filter if provided
    const filteredThreads = allThreads.filter((threadData) => {
      if (
        !threadData ||
        threadData.labelIds.includes('TRASH') ||
        threadData.labelIds.includes('SPAM')
      ) {
        return false;
      }

      // If lastTimestamp is provided, only include threads older than that timestamp
      if (lastTimestamp !== undefined) {
        return threadData.timestamp < lastTimestamp;
      }

      return true;
    });

    // Construct the threads
    const constructedThreads = await Promise.all(
      filteredThreads.map(async (threadData) => {
        // Construct the thread
        const thread = await fetchAndConstructThread(tx, threadData, uid);
        if (thread) {
          // Add user ID as a non-enumerable property to the thread
          Object.defineProperty(thread, 'accountId', {
            value: uid,
            enumerable: false,
            configurable: true
          });
        }
        return thread;
      })
    );

    await tx.done;
    return constructedThreads.filter((thread): thread is MonoThread => thread !== null);
  });

  // Wait for all promises to resolve
  const threadsFromAllUsers = await Promise.all(allThreadPromises);

  // Flatten the array and sort by timestamp in descending order
  const flattenedThreads = threadsFromAllUsers.flat().sort((a, b) => b.timestamp - a.timestamp);

  // Apply the limit
  return flattenedThreads.slice(0, limit);
}

/**
 * Fetch threads with a specific label from multiple user accounts with timestamp-based pagination
 *
 * @param uids - Array of user IDs to fetch threads from
 * @param label - The label to filter threads by
 * @param limit - Maximum number of threads to return
 * @param lastTimestamp - Timestamp to use for pagination (fetch threads older than this)
 * @returns Promise with array of threads matching the criteria
 */
export async function DBGetThreadsByLabelMultiUser(
  uids: string[],
  label: ValidLabel | string,
  limit: number = 50,
  lastTimestamp?: number
): Promise<MonoThread[]> {
  // Convert label to uppercase for consistency
  const upperLabel = label.toUpperCase();
  const isCategory =
    upperLabel === 'PRIMARY' ||
    upperLabel === 'SOCIAL' ||
    upperLabel === 'PROMOTIONS' ||
    upperLabel === 'UPDATES' ||
    upperLabel === 'FORUMS';

  // Special handling for Gmail categories
  const categoryLabel = isCategory ? getCategoryLabel(upperLabel) : upperLabel;

  // Collect all threads from each user ID
  const allThreadPromises = uids.map(async (uid) => {
    const authCacheData = await authCache.getCachedData();
    const preference = authCacheData?.preference;
    if (!preference) {
      return [];
    }

    const db = await initDB(uid);
    const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
    const threadsStore = tx.objectStore('threads');
    let threadsMatchingLabel;

    // Special handling for Primary category
    if (upperLabel === 'PRIMARY') {
      // Get all threads
      const allThreads = await threadsStore.getAll();

      // Filter for Primary threads (both approaches)
      threadsMatchingLabel = allThreads.filter((thread) => isPrimaryThread(thread, preference));
    } else if (isCategory) {
      // For other categories, use the category label
      threadsMatchingLabel = await threadsStore.index('byLabelIds').getAll(categoryLabel);
    } else {
      // Regular label handling
      threadsMatchingLabel = await threadsStore.index('byLabelIds').getAll(upperLabel);
    }

    // Filter out trash threads and apply timestamp filter if provided
    const filteredThreads = threadsMatchingLabel.filter((threadData) => {
      if (!threadData || threadData.labelIds.includes('TRASH')) {
        return false;
      }

      // If lastTimestamp is provided, only include threads older than that timestamp
      if (lastTimestamp !== undefined) {
        return threadData.timestamp < lastTimestamp;
      }

      return true;
    });

    // Construct the threads
    const constructedThreads = await Promise.all(
      filteredThreads.map(async (threadData) => {
        // Construct the thread
        const thread = await fetchAndConstructThread(tx, threadData, uid);
        if (thread) {
          // Add user ID as a non-enumerable property to the thread
          Object.defineProperty(thread, 'accountId', {
            // Changed from 'userId' to 'accountId' for consistency
            value: uid,
            enumerable: false,
            configurable: true
          });
        }
        return thread;
      })
    );

    await tx.done;
    return constructedThreads.filter((thread): thread is MonoThread => thread !== null);
  });

  // Wait for all promises to resolve
  const threadsFromAllUsers = await Promise.all(allThreadPromises);

  // Flatten the array and sort by timestamp in descending order
  const flattenedThreads = threadsFromAllUsers.flat().sort((a, b) => b.timestamp - a.timestamp);

  // Apply the limit
  return flattenedThreads.slice(0, limit);
}

/**
 * Fetch the latest thread (by timestamp) from the database for a specific user
 * This is useful for getting the most recent historyId for sync operations
 *
 * @param uid - User ID to fetch the latest thread for
 * @returns Promise with the most recent thread or null if no threads exist
 */
export async function DBGetLatestThread(uid: string): Promise<MonoThread | null> {
  const db = await initDB(uid);
  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
  const threadsStore = tx.objectStore('threads');

  // Get all threads (we'll sort them)
  const allThreads = await threadsStore.getAll();

  // If no threads, return null
  if (allThreads.length === 0) return null;

  // Find the thread with the most recent timestamp
  // Sort by timestamp in descending order (newest first)
  const sortedThreads = allThreads
    .filter((thread) => thread.id.length < 20)
    .sort((a, b) => b.timestamp - a.timestamp);

  // Get the newest thread
  const latestThreadData = sortedThreads[0];

  if (!latestThreadData) return null;

  // Construct and return the complete thread object
  const thread = await fetchAndConstructThread(tx, latestThreadData, uid);
  await tx.done;

  return thread;
}

/**
 * Get the oldest timestamp from a collection of threads
 * Used for pagination in subsequent requests
 */
export function getOldestTimestamp(threads: MonoThread[]): number | undefined {
  if (threads.length === 0) return undefined;
  return Math.min(...threads.map((thread) => thread.timestamp));
}

/**
 * Get the count of threads with multiple labels for a user
 *
 * @param uid - User ID to fetch the thread count for
 * @param labels - Array of labels to count threads by (e.g., ['INBOX', 'UNREAD'])
 * @returns Promise with the count of threads that have ALL the specified labels
 */
export async function DBGetThreadCountByLabels(
  uid: string,
  labels: (ValidLabel | string)[]
): Promise<number> {
  const authCacheData = await authCache.getCachedData();
  const preference = authCacheData?.preference;

  if (!preference) {
    return 0;
  }

  const db = await initDB(uid);
  const tx = db.transaction(['threads'], 'readonly');
  const threadsStore = tx.objectStore('threads');

  // Check if PRIMARY is in the requested labels
  const hasPrimary = labels.some((label) => label.toUpperCase() === 'PRIMARY');

  // Process non-PRIMARY labels
  const nonPrimaryLabels = labels
    .filter((label) => label.toUpperCase() !== 'PRIMARY')
    .map((label) => {
      const upperLabel = label;

      // Special handling for Gmail categories
      const isCategory =
        upperLabel === 'SOCIAL' ||
        upperLabel === 'PROMOTIONS' ||
        upperLabel === 'UPDATES' ||
        upperLabel === 'FORUMS';

      // Return category label if applicable, otherwise the uppercase label
      return isCategory ? getCategoryLabel(upperLabel) : upperLabel;
    });

  // Get all threads - needed for PRIMARY checking or multiple label filtering
  const allThreads = await threadsStore.getAll();

  // Filter threads that have all the specified labels
  const matchingThreads = allThreads.filter((thread) => {
    // Skip trash and spam threads
    if (thread.labelIds.includes('TRASH') || thread.labelIds.includes('SPAM')) {
      return false;
    }

    // Check PRIMARY label using isPrimaryThread if required
    if (hasPrimary && preference && !isPrimaryThread(thread, preference)) {
      return false;
    }

    // Check all other requested labels
    if (!nonPrimaryLabels.every((label) => thread.labelIds.includes(label))) {
      return false;
    }

    // All conditions met
    return true;
  });

  await tx.done;
  return matchingThreads.length;
}
