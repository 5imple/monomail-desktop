import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { initDB } from '@/renderer/app/lib/db/db';
import { MonoDraftRecord } from '@/renderer/app/lib/db/types/index';
import {
  fetchAndConstructThread,
  removeMessageAndUpdateThread
} from '@/renderer/app/lib/db/thread/utils';

/**
 * Save a draft to the database and associate it with its thread.
 * @param uid - User ID for the database namespace.
 * @param draft - MonoDraft containing draft details.
 */
export async function DBSaveGmailDraft(uid: string, draft: MonoDraftRecord): Promise<void> {
  const db = await initDB(uid);
  const tx = db.transaction(['drafts', 'threads'], 'readwrite');
  const draftsStore = tx.objectStore('drafts');

  // Save the draft
  await draftsStore.put({
    messageId: draft.messageId,
    threadId: draft.threadId,
    id: draft.id
  });

  await tx.done;
}

/**
 * Get a specific draft by its ID.
 * @param uid - User ID for the database namespace.
 * @param draftId - Draft ID to fetch.
 * @returns MonoDraft or null if not found.
 */

export async function DBGetGmailDraftById(
  uid: string,
  draftId: string
): Promise<{
  draftId: string;
  message: MonoMessage;
} | null> {
  const db = await initDB(uid);

  const tx = db.transaction(['drafts', 'messages'], 'readonly');
  const draftsStore = tx.objectStore('drafts');
  const messagesStore = tx.objectStore('messages');

  // Get the draft record by draftId
  const draftRecord = await draftsStore.get(draftId);

  if (!draftRecord) {
    console.error(`Draft with ID ${draftId} not found`);
    return null;
  }

  // Fetch the associated message by messageId
  const message = await messagesStore.get(draftRecord.messageId);

  if (!message) {
    console.error(`Message with ID ${draftRecord.messageId} not found for draft ${draftId}`);
    return null;
  }

  await tx.done;

  // Construct and return the draft
  return {
    draftId: draftRecord.draftId,
    message: message as MonoMessage
  };
}

/**
 * Remove a draft by its ID.
 * @param uid - User ID for the database namespace.
 * @param draftId - Draft ID to remove.
 */
export async function DBRemoveGmailDraft(uid: string, draftId: string) {
  const db = await initDB(uid);

  const tx = db.transaction(['drafts', 'messages', 'threads'], 'readwrite');
  const draftsStore = tx.objectStore('drafts');

  // Get the draft data
  const draft = await draftsStore.get(draftId);

  if (!draft) {
    console.error(`Draft ${draftId} not found`);
    return;
  }

  const { messageId, threadId } = draft;

  // Remove the draft
  await draftsStore.delete(draftId);

  // Use the helper to remove the message and update the thread
  await removeMessageAndUpdateThread(tx, messageId, threadId);

  await tx.done;
}

/**
 * Get all threads with drafts, returning full thread objects with message details.
 * If a thread ID doesn't exist in the database, create an empty thread for each draft.
 * @param uid - User ID for the database namespace.
 * @param limit - Number of drafts to process.
 * @param offset - Offset for pagination.
 * @returns Array of MonoThread objects.
 */
export async function DBGetAllGmailDraftThreads(
  uid: string,
  limit: number = 50,
  offset: number = 0
): Promise<MonoThread[]> {
  const db = await initDB(uid);

  const tx = db.transaction(['threads', 'messages', 'drafts'], 'readonly');
  const threadsStore = tx.objectStore('threads');
  const draftsStore = tx.objectStore('drafts');

  // Fetch all draft records
  const draftRecords = await draftsStore.getAll();

  // Get unique thread IDs from drafts
  const threadIds = Array.from(new Set(draftRecords.map((draft) => draft.threadId)));

  // Apply pagination: slice the thread IDs based on limit and offset
  const paginatedThreadIds = threadIds.slice(offset, offset + limit);

  const threads = await Promise.all(
    paginatedThreadIds.map(async (threadId) => {
      const threadData = await threadsStore.get(threadId);
      if (!threadData) return null;
      // Filter out undefined messages and construct the full thread object
      return fetchAndConstructThread(tx, threadData, uid);
    })
  );

  await tx.done;

  // Filter out null threads and return the array
  return threads.filter(Boolean) as MonoThread[];
}
