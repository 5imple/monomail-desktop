import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import { MonoAttachment, MonoRecipient } from '@/main/models/types';
import { MonoCacheDB } from '@/renderer/app/lib/db/db';
import { MonoThreadRecord } from '@/renderer/app/lib/db/types/index';
import { IDBPTransaction } from 'idb';

export async function removeDraftAndUpdateThread(
  tx: IDBPTransaction<MonoCacheDB, string[], 'readwrite'>,
  draftId: string,
  threadId: string
) {
  const draftsStore = tx.objectStore('drafts');
  const threadsStore = tx.objectStore('threads');
  const messagesStore = tx.objectStore('messages');

  // Delete the draft
  const draftData = await draftsStore.get(draftId);
  if (!draftData) {
    console.error(`Draft ${draftId} not found`);
    return;
  }
  await draftsStore.delete(draftId);

  // Retrieve the thread
  const threadData = await threadsStore.get(threadId);
  if (!threadData) {
    console.warn(`Thread ${threadId} not found, skipping update.`);
    return;
  }

  // Remove the draft from the thread's items
  threadData.items = threadData.items.filter((itemId) => itemId !== draftId);

  if (threadData.items.length === 0) {
    // If no items remain, delete the thread
    await threadsStore.delete(threadId);
  } else {
    // Fetch all remaining items (messages and drafts) in the thread
    const remainingItemsPromises = threadData.items.map(async (itemId) => {
      const message = await messagesStore.get(itemId);
      const draft = await draftsStore.get(itemId);
      return message || draft;
    });
    const remainingItems = (await Promise.all(remainingItemsPromises)).filter(Boolean);

    // Recalculate thread properties based on remaining items
    const updatedThread = {
      ...threadData,
      items: threadData.items.map((itemId) => itemId).filter(Boolean),
      from: Array.from(
        new Set(
          remainingItems
            .map((item) => item.from)
            .flat()
            .filter(Boolean)
        )
      ),
      cc: Array.from(
        new Set(
          remainingItems
            .map((item) => item.cc)
            .flat()
            .filter(Boolean)
        )
      ),
      bcc: Array.from(
        new Set(
          remainingItems
            .map((item) => item.bcc)
            .flat()
            .filter(Boolean)
        )
      ),
      labelIds: Array.from(
        new Set(
          remainingItems
            .map((item) => item.labelIds)
            .flat()
            .filter(Boolean)
        )
      ),
      timestamp: Math.max(...remainingItems.map((item) => item.timestamp))
    };

    // Ensure the `DRAFT` label is still present if drafts exist
    const hasDrafts = remainingItems.some((item) => item.type === 'draft');
    if (hasDrafts && !updatedThread.labelIds.includes('DRAFT')) {
      updatedThread.labelIds.push('DRAFT');
    } else if (!hasDrafts) {
      updatedThread.labelIds = updatedThread.labelIds.filter((label) => label !== 'DRAFT');
    }

    // Save the updated thread
    await threadsStore.put(updatedThread);
  }
}

export async function removeMessageAndUpdateThread(
  tx: IDBPTransaction<MonoCacheDB, string[], 'readwrite'>,
  messageId: string,
  threadId: string
) {
  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');
  const threadsStore = tx.objectStore('threads');

  // Delete the message
  const messageData = await messagesStore.get(messageId);
  if (!messageData) {
    console.error(`Message ${messageId} not found`);
    return;
  }
  await messagesStore.delete(messageId);

  // Retrieve the thread
  const threadData = await threadsStore.get(threadId);
  if (!threadData) {
    console.warn(`Thread ${threadId} not found, skipping update.`);
    return;
  }

  // Remove the message from the thread's items
  threadData.items = threadData.items.filter((itemId) => itemId !== messageId);

  if (threadData.items.length === 0) {
    // If no items remain, delete the thread
    await threadsStore.delete(threadId);
  } else {
    // Fetch all remaining items (messages and drafts) in the thread
    const remainingItemsPromises = threadData.items.map(async (itemId) => {
      const message = await messagesStore.get(itemId);
      const draft = await draftsStore.get(itemId);
      return message || draft;
    });
    const remainingItems = (await Promise.all(remainingItemsPromises)).filter(Boolean);

    // Recalculate thread properties based on remaining items
    const updatedThread = {
      ...threadData,
      items: threadData.items.map((itemId) => itemId).filter(Boolean),
      from: Array.from(
        new Set(
          remainingItems
            .map((item) => item.from)
            .flat()
            .filter(Boolean)
        )
      ),
      cc: Array.from(
        new Set(
          remainingItems
            .map((item) => item.cc)
            .flat()
            .filter(Boolean)
        )
      ),
      bcc: Array.from(
        new Set(
          remainingItems
            .map((item) => item.bcc)
            .flat()
            .filter(Boolean)
        )
      ),
      labelIds: Array.from(
        new Set(
          remainingItems
            .map((item) => item.labelIds)
            .flat()
            .filter(Boolean)
        )
      ),
      timestamp: Math.max(...remainingItems.map((item) => item.timestamp))
    };

    // Ensure the `DRAFT` label is present if drafts exist
    const hasDrafts = remainingItems.some((item) => item.type === 'draft');
    if (hasDrafts && !updatedThread.labelIds.includes('DRAFT')) {
      updatedThread.labelIds.push('DRAFT');
    } else if (!hasDrafts) {
      updatedThread.labelIds = updatedThread.labelIds.filter((label) => label !== 'DRAFT');
    }

    // Save the updated thread
    await threadsStore.put(updatedThread);
  }
}

/**
 * Updates the labels on a thread based on the labels of its items (messages and drafts).
 * - Adds labels to the thread if not already present.
 * - Removes labels from the thread if no remaining items have those labels.
 */
export async function updateThreadLabels(
  tx: IDBPTransaction<MonoCacheDB, string[], 'readwrite'>,
  threadId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');
  const threadsStore = tx.objectStore('threads');

  // Retrieve the thread from the database
  const threadData = await threadsStore.get(threadId);
  if (!threadData) {
    console.warn(`Thread ${threadId} not found, skipping update.`);
    return;
  }

  // Fetch all items (messages and drafts) in the thread
  const remainingItemsPromises = threadData.items.map(async (itemId) => {
    const message = await messagesStore.get(itemId);
    const draft = await draftsStore.get(itemId);
    return message || draft;
  });
  const remainingItems = (await Promise.all(remainingItemsPromises)).filter(Boolean);

  // Convert to a set to avoid duplicate labels
  const threadLabelsSet = new Set(threadData.labelIds);

  // Add new labels to the thread if they are not already present
  addLabelIds.forEach((label) => threadLabelsSet.add(label));

  // Remove labels only if no remaining items have them
  removeLabelIds.forEach((label) => {
    const labelInItems = remainingItems.some((item) => item.labelIds?.includes(label));
    if (!labelInItems) {
      threadLabelsSet.delete(label);
    }
  });

  // Convert the set back to an array
  threadData.labelIds = Array.from(threadLabelsSet);

  // Save the updated thread back to the database
  await threadsStore.put(threadData);
}

export async function calculateThreadFlags(
  tx: IDBPTransaction<MonoCacheDB, string[], 'readwrite'>,
  threadId: string
) {
  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');

  // Fetch all messages and drafts associated with the thread
  const threadMessages = await messagesStore.index('byThreadId').getAll(threadId);
  const threadDrafts = await draftsStore.index('byThreadId').getAll(threadId);

  // Initialize a Set to accumulate unique labels
  const accumulatedLabels = new Set<string>();

  // Add labels from messages
  threadMessages.forEach((message) => {
    if (message.labelIds) {
      message.labelIds.forEach((label) => accumulatedLabels.add(label));
    }
  });

  // Add 'DRAFT' label for each draft
  if (threadDrafts.length > 0) {
    accumulatedLabels.add('DRAFT');
  }

  // Convert accumulated labels to flags
  const flags = Array.from(accumulatedLabels);

  return flags;
}

export async function fetchAndConstructThread(
  tx: IDBPTransaction<MonoCacheDB, string[], 'readwrite' | 'readonly'>,
  threadData: MonoThreadRecord | null,
  uid?: string
): Promise<MonoThread | null> {
  if (!threadData) return null;

  const messagesStore = tx.objectStore('messages');
  const draftsStore = tx.objectStore('drafts');
  // Fetch all items (messages or drafts) by their IDs
  const items = await Promise.all(
    threadData.items.map(async (id: string) => {
      const message = await messagesStore.get(id);
      if (message) return MonoMessage.fromPlainObject(message);
      const draft = await draftsStore.get(id);
      if (draft) return MonoDraft.fromPlainObject(draft);
      return null;
    })
  );

  // Filter out null items
  const validItems = items.filter((item): item is MonoMessage | MonoDraft => item !== null);
  return new MonoThread({ ...threadData, accountId: uid ?? '', items: validItems });
}

export function calculateAttachments(
  items: (MonoMessage | MonoDraft)[]
): Record<string, MonoAttachment> {
  return items.reduce((acc, item) => {
    if (item.attachments) {
      Object.assign(acc, item.attachments);
    }
    return acc;
  }, {});
}

export function calculateRecipients(
  items: (MonoMessage | MonoDraft)[],
  field: 'from' | 'to' | 'cc' | 'bcc'
): MonoRecipient[] {
  const recipientMap = new Map<string, MonoRecipient>();

  items.forEach((item) => {
    if (item instanceof MonoMessage) {
      // Handle MonoMessage
      const recipients = Array.isArray(item[field])
        ? (item[field] as MonoRecipient[])
        : [item[field] as MonoRecipient];

      recipients.forEach((recipient) => {
        if (recipient?.email) {
          recipientMap.set(recipient.email, recipient);
        }
      });
    } else if (item instanceof MonoDraft) {
      // Handle MonoDraft
      const draftField = item[field];
      const recipients = Array.isArray(draftField)
        ? draftField.map((email) => ({ name: '', email }))
        : [{ name: '', email: draftField as string }];

      recipients.forEach((recipient) => {
        if (recipient?.email) {
          recipientMap.set(recipient.email, recipient);
        }
      });
    }
  });

  return Array.from(recipientMap.values());
}

export function calculateCombinedLabels(items: (MonoMessage | MonoDraft)[]): string[] {
  const labelSet = new Set<string>();

  items.forEach((item) => {
    (item.labelIds || []).forEach((label) => {
      labelSet.add(label);
    });
  });

  return Array.from(labelSet);
}

export function calculateRemainingRecipients(
  items: (MonoMessage | MonoDraft)[],
  field: 'from' | 'to' | 'cc' | 'bcc'
): MonoRecipient[] {
  const recipientMap = new Map<string, MonoRecipient>();

  items.forEach((item) => {
    const recipients = Array.isArray(item[field])
      ? (item[field] as MonoRecipient[])
      : [item[field] as MonoRecipient];

    recipients.forEach((recipient) => {
      if (recipient?.email) {
        recipientMap.set(recipient.email, recipient);
      }
    });
  });

  return Array.from(recipientMap.values());
}
