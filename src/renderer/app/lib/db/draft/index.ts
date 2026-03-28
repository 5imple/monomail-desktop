import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { initDB } from '@/renderer/app/lib/db/db';
import {
  fetchAndConstructThread,
  removeDraftAndUpdateThread
} from '@/renderer/app/lib/db/thread/utils';

/**
 * Save a draft to the database and associate it with its thread.
 * @param uid - User ID for the database namespace.
 * @param draft - MonoDraft containing draft details.
 */
export async function DBSaveDraft(uid: string, draft: MonoDraft): Promise<void> {
  const db = await initDB(uid);
  const tx = db.transaction(['drafts', 'threads', 'messages'], 'readwrite');
  const draftsStore = tx.objectStore('drafts');
  const threadsStore = tx.objectStore('threads');

  if (!draft.threadId) {
    draft.threadId = draft.id;
  }
  // Save the draft
  await draftsStore.put(draft.toPlainObject());
  function getPlainTextSnippet(html: string, length: number = 100): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc.body.textContent?.slice(0, length) || '';
  }

  // Fetch the associated thread
  const threadData = await threadsStore.get(draft.threadId);
  const thread: MonoThread | null = threadData
    ? await fetchAndConstructThread(tx, threadData, uid)
    : draft.threadId.length < 20
      ? null
      : new MonoThread({
          accountId: uid,
          id: draft.id,
          labelIds: ['DRAFT'],
          from: draft.to.map((email) => ({ email, name: email })),
          bcc: draft.bcc.map((email) => ({ email, name: email })),
          cc: draft.cc.map((email) => ({ email, name: email })),
          subject: draft.subject || '',
          snippet: getPlainTextSnippet(draft.body),
          historyId: null,
          timestamp: draft.timestamp,
          items: [draft]
        });
  if (thread) {
    // If the thread exists, update it to include the draft
    if (!thread.items.some((item) => item.id === draft.id)) {
      thread.items.push(draft); // Include the draft in the thread items
      thread.labelIds = [...new Set([...thread.labelIds, ...['DRAFT']])];
      thread.timestamp = Math.max(thread.timestamp, draft.timestamp); // Update the timestamp
    }

    // Save the updated or new thread
    const threadItems = {
      ...thread,
      items: thread.items.map((item) => item.id).filter(Boolean)
    };
    await threadsStore.put(threadItems);
  }
  await tx.done;
}

/**
 * Get drafts by thread ID.
 * @param uid - User ID for the database namespace.
 * @param threadId - Thread ID to fetch drafts for.
 * @returns Array of MonoDraft
 */
export async function DBGetDraftsByThreadId(uid: string, threadId: string): Promise<MonoDraft[]> {
  const db = await initDB(uid);
  const draftsStore = db.transaction(['drafts'], 'readonly').objectStore('drafts');
  const index = draftsStore.index('byThreadId');

  const drafts = await index.getAll(threadId);
  return drafts.map((draft) => MonoDraft.fromPlainObject(draft));
}

/**
 * Get a specific draft by its ID.
 * @param uid - User ID for the database namespace.
 * @param draftId - Draft ID to fetch.
 * @returns MonoDraft or null if not found.
 */
export async function DBGetDraftById(uid: string, draftId: string): Promise<MonoDraft | null> {
  const db = await initDB(uid);
  const draftsStore = db.transaction(['drafts'], 'readonly').objectStore('drafts');

  const draft = await draftsStore.get(draftId);
  return draft ? MonoDraft.fromPlainObject(draft) : null;
}

/**
 * Remove a draft by its ID.
 * @param uid - User ID for the database namespace.
 * @param draftId - Draft ID to remove.
 */
export async function DBRemoveDraft(uid: string, draftId: string): Promise<void> {
  const db = await initDB(uid);
  const tx = db.transaction(['drafts', 'threads', 'messages'], 'readwrite');
  const draftsStore = tx.objectStore('drafts');
  const draftData = await draftsStore.get(draftId);
  if (!draftData) {
    console.error(`Draft ${draftId} not found`);
    return;
  }

  const draft = MonoDraft.fromPlainObject(draftData);

  try {
    if (draft.threadId) {
      // Use the utility function to handle draft removal and thread update
      await removeDraftAndUpdateThread(tx, draft.id, draft.threadId); // draft handled similarly
    } else {
      await draftsStore.delete(draftId);
    }
  } catch (error) {
    console.error(`Error removing draft ${draftId}:`, error);
  } finally {
    await tx.done;
  }
}

/**
 * Get all threads with drafts, returning full thread objects with message details.
 * If a thread ID doesn't exist in the database, create an empty thread for each draft.
 * @param uid - User ID for the database namespace.
 * @param limit - Number of drafts to process.
 * @param offset - Offset for pagination.
 * @returns Array of MonoThread objects.
 */
export async function DBGetAllDraftThreads(
  uid: string,
  label: string,
  limit: number = 50,
  offset: number = 0
): Promise<MonoThread[]> {
  const db = await initDB(uid);
  const tx = db.transaction(['drafts', 'threads', 'messages'], 'readonly');
  const draftsStore = tx.objectStore('drafts');
  const threadsStore = tx.objectStore('threads');

  // Fetch all draft records
  const draftRecords = await draftsStore.getAll();

  // Apply pagination
  const paginatedDrafts = draftRecords.slice(offset, offset + limit);

  const threads = await Promise.all(
    paginatedDrafts.map(async (draft) => {
      if (draft.threadId) {
        const threadData = await threadsStore.get(draft.threadId);

        if (threadData && !threadData.labelIds.includes('TRASH')) {
          // If the thread exists, construct it using fetchAndConstructThread
          return await fetchAndConstructThread(tx, threadData, uid);
        }
      }
      return null;
    })
  );

  const results = threads.filter(Boolean);
  return results as MonoThread[];
}

/**
 * Get all threads with drafts for multiple users, returning full thread objects with message details.
 * Uses timestamp-based pagination for consistent results across multiple calls.
 * @param uids - Array of user IDs to fetch drafts from
 * @param label - The label identifier (not used for drafts but kept for API consistency)
 * @param limit - Maximum number of threads to return
 * @param lastTimestamp - Timestamp to use for pagination (fetch drafts older than this)
 * @returns Promise with array of MonoThread objects
 */
export async function DBGetAllDraftThreadsMultiUser(
  uids: string[],
  label: string,
  limit: number = 50,
  lastTimestamp?: number
): Promise<MonoThread[]> {
  // Collect all draft threads from each user ID
  const allDraftThreadsPromises = uids.map(async (uid) => {
    const db = await initDB(uid);
    const tx = db.transaction(['drafts', 'threads', 'messages'], 'readonly');
    const draftsStore = tx.objectStore('drafts');
    const threadsStore = tx.objectStore('threads');

    // Fetch all draft records
    const draftRecords = await draftsStore.getAll();

    // Filter by timestamp if provided
    const filteredDrafts = lastTimestamp
      ? draftRecords.filter((draft) => draft.timestamp < lastTimestamp)
      : draftRecords;

    // Sort drafts by timestamp in descending order
    const sortedDrafts = filteredDrafts.sort((a, b) => b.timestamp - a.timestamp);

    const threads = await Promise.all(
      sortedDrafts.map(async (draft) => {
        if (draft.threadId) {
          const threadData = await threadsStore.get(draft.threadId);

          if (threadData) {
            // Construct the thread
            const thread = await fetchAndConstructThread(tx, threadData, uid);
            if (thread) {
              // Add user ID as a non-enumerable property to the thread
              Object.defineProperty(thread, 'userId', {
                value: uid,
                enumerable: false,
                configurable: true
              });

              return thread;
            }
          }
        }
        return null;
      })
    );

    await tx.done;
    return threads.filter((thread): thread is MonoThread => thread !== null);
  });

  // Wait for all promises to resolve
  const draftsFromAllUsers = await Promise.all(allDraftThreadsPromises);

  // Flatten the array and sort by timestamp in descending order
  const flattenedThreads = draftsFromAllUsers.flat().sort((a, b) => b.timestamp - a.timestamp);

  // Apply the limit
  return flattenedThreads.slice(0, limit);
}

/**
 * Get the oldest timestamp from a collection of threads
 * Used for pagination in subsequent requests
 */
export function getOldestTimestamp(threads: MonoThread[]): number | undefined {
  if (threads.length === 0) return undefined;
  return Math.min(...threads.map((thread) => thread.timestamp));
}
