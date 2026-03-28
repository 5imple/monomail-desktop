import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import {
  fetchAndConstructThread,
  removeMessageAndUpdateThread,
  updateThreadLabels
} from '@/renderer/app/lib/db/thread/utils';
import { initDB } from '../db';
import { MonoDraft } from '@/main/models/draft/MonoDraft';

export async function DBSaveMessage(uid: string, message: MonoMessage) {
  const db = await initDB(uid);
  const tx = db.transaction(['messages', 'contacts', 'threads', 'drafts'], 'readwrite');
  const messagesStore = tx.objectStore('messages');
  const threadsStore = tx.objectStore('threads');
  const draftsStore = tx.objectStore('drafts');

  await messagesStore.put(message.toPlainObject());

  // Check for drafts with the same thread ID
  const existingDrafts = await draftsStore.index('byThreadId').getAll(message.threadId);
  const draftIds = existingDrafts.map((draft) => draft.id);

  const threadData = await threadsStore.get(message.threadId);
  let thread: MonoThread | null = await fetchAndConstructThread(tx, threadData, uid);

  if (thread) {
    if (!thread.items.some((item) => item.id === message.id)) {
      thread.items.push(message);
      thread.accountId = uid;
      thread.from = [...new Set([...thread.from, ...[message.from]])];
      thread.cc = [...new Set([...thread.cc, ...message.cc])];
      thread.bcc = [...new Set([...thread.bcc, ...message.bcc])];

      // Add draft labels if we have drafts
      if (existingDrafts.length > 0) {
        thread.labelIds = [...new Set([...thread.labelIds, ...message.labelIds, 'DRAFT'])];
      } else {
        thread.labelIds = [...new Set([...thread.labelIds, ...message.labelIds])];
      }

      thread.timestamp = Math.max(thread.timestamp, message.timestamp);
    }

    // Add any draft IDs that aren't already in the thread items
    const existingItemIds = thread.items.map((item) => item.id);
    const missingDraftIds = draftIds.filter((id) => !existingItemIds.includes(id));

    if (missingDraftIds.length > 0) {
      // Fetch the draft objects for the missing IDs
      const missingDrafts = await Promise.all(
        missingDraftIds.map(async (id) => {
          const draft = await draftsStore.get(id);
          return draft ? MonoDraft.fromPlainObject(draft) : null;
        })
      );

      // Add valid drafts to thread items
      const validDrafts = missingDrafts.filter((draft) => draft !== null) as MonoDraft[];
      thread.items.push(...validDrafts);
    }
  } else {
    // Creating a new thread
    thread = new MonoThread({
      accountId: uid,
      id: message.threadId,
      items: [message],
      labelIds: existingDrafts.length > 0 ? [...message.labelIds, 'DRAFT'] : message.labelIds,
      from: [message.from],
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      snippet: message.snippet,
      timestamp: message.timestamp
    });

    // Add any drafts to the new thread
    if (existingDrafts.length > 0) {
      const drafts = existingDrafts.map((draft) => MonoDraft.fromPlainObject(draft));
      thread.items.push(...drafts);
    }
  }

  // Save the updated thread
  const threadItems = {
    ...thread,
    items: thread.items.map((item) => item.id).filter(Boolean)
  };
  await threadsStore.put(threadItems);

  await tx.done;
}

export async function DBGetMessage(uid: string, messageId: string): Promise<MonoMessage | null> {
  const db = await initDB(uid);
  const tx = db.transaction(['messages'], 'readonly');
  const messagesStore = tx.objectStore('messages');
  const messageData = await messagesStore.get(messageId);

  await tx.done;
  return messageData ? MonoMessage.fromPlainObject(messageData) : null;
}
export async function DBUpdateMessageLabels(
  uid: string,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
) {
  const db = await initDB(uid);
  const tx = db.transaction(['messages', 'threads', 'drafts'], 'readwrite');
  const messagesStore = tx.objectStore('messages');

  const messageData = await messagesStore.get(messageId);
  if (!messageData) {
    console.warn(`Message ${messageId} not found`);
    return;
  }

  const message = MonoMessage.fromPlainObject(messageData);

  // Update the labels
  message.labelIds = [
    ...message.labelIds.filter((label) => !removeLabelIds.includes(label)),
    ...addLabelIds.filter((label) => !message.labelIds.includes(label))
  ];

  await messagesStore.put(message.toPlainObject());

  // Update thread-category flags if labels impact categorization
  await updateThreadLabels(tx, message.threadId, addLabelIds, removeLabelIds);

  await tx.done;
}

export async function DBOverrideMessageLabels(
  uid: string,
  messageId: string,
  newLabelIds: string[]
) {
  const db = await initDB(uid);
  const tx = db.transaction(['messages', 'threads', 'drafts'], 'readwrite');
  const messagesStore = tx.objectStore('messages');

  const messageData = await messagesStore.get(messageId);
  if (!messageData) {
    console.warn(`Message ${messageId} not found`);
    return;
  }

  const message = MonoMessage.fromPlainObject(messageData);
  const oldLabelIds = [...message.labelIds]; // Store old labels for thread update

  // Replace all labels with the new ones
  message.labelIds = [...newLabelIds];

  await messagesStore.put(message.toPlainObject());

  // Calculate which labels were added and removed for thread update
  const addedLabels = newLabelIds.filter((label) => !oldLabelIds.includes(label));
  const removedLabels = oldLabelIds.filter((label) => !newLabelIds.includes(label));

  // Update thread-category flags if labels impact categorization
  if (addedLabels.length > 0 || removedLabels.length > 0) {
    await updateThreadLabels(tx, message.threadId, addedLabels, removedLabels);
  }

  await tx.done;
}

export async function DBRemoveMessage(uid: string, messageId: string) {
  const db = await initDB(uid);

  const tx = db.transaction(['messages', 'threads', 'drafts'], 'readwrite');
  const messagesStore = tx.objectStore('messages');

  const messageData = await messagesStore.get(messageId);
  if (!messageData) {
    console.warn(`Message ${messageId} not found`);
    return;
  }

  const message = MonoMessage.fromPlainObject(messageData);

  try {
    // Use the utility function to handle message removal and thread update
    await removeMessageAndUpdateThread(tx, message.id, message.threadId);
  } catch (error) {
    console.error(`Error removing message ${messageId}:`, error);
  } finally {
    await tx.done;
  }
}

export async function DBUpsertMessage(uid: string, message: MonoMessage) {
  const db = await initDB(uid);
  const tx = db.transaction(['messages', 'contacts', 'threads', 'drafts'], 'readwrite');
  const messagesStore = tx.objectStore('messages');

  // Check if message already exists
  const existingMessage = await messagesStore.get(message.id);
  
  if (existingMessage) {
    // Update existing message with new data while preserving certain fields
    const existing = MonoMessage.fromPlainObject(existingMessage);
    
    // Update key fields that might have changed
    existing.labelIds = message.labelIds;
    existing.snippet = message.snippet;
    existing.timestamp = message.timestamp;
    existing.attachments = message.attachments;
    existing.bodyPlain = message.bodyPlain;
    existing.bodyHtml = message.bodyHtml;
    
    await messagesStore.put(existing.toPlainObject());
    
    // Update thread with any label changes
    const threadsStore = tx.objectStore('threads');
    const threadData = await threadsStore.get(message.threadId);
    
    if (threadData) {
      const thread = await fetchAndConstructThread(tx, threadData, uid);
      if (thread) {
        // Update thread labels with the new message labels
        thread.labelIds = [...new Set([...thread.labelIds, ...message.labelIds])];
        thread.timestamp = Math.max(thread.timestamp, message.timestamp);
        
        const threadItems = {
          ...thread,
          items: thread.items.map((item) => item.id).filter(Boolean)
        };
        await threadsStore.put(threadItems);
      }
    }
  } else {
    // Message doesn't exist, use regular save logic
    await DBSaveMessage(uid, message);
  }
  
  await tx.done;
}

export async function DBGetMessagesByLabel(
  uid: string,
  label: string,
  limit: number = 50,
  offset: number = 0
): Promise<MonoMessage[]> {
  const db = await initDB(uid);
  const tx = db.transaction(['messages'], 'readonly');
  const messagesStore = tx.objectStore('messages');

  // NOTE: Messages don't have a byLabelIds index like threads do, so we need to scan all messages
  // TODO: Consider adding a byLabelIds multiEntry index to messages store in a future migration
  const allMessages = await messagesStore.getAll();

  // Filter messages that have the specified label
  const messagesMatchingLabel = allMessages.filter((messageData) => {
    return (
      messageData && messageData.labelIds && messageData.labelIds.includes(label.toUpperCase())
    );
  });

  // Sort by timestamp in descending order and apply pagination
  const sortedMessages = messagesMatchingLabel
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(offset, offset + limit);

  // Convert to MonoMessage objects, filtering out any invalid entries
  const messages = sortedMessages
    .map((messageData) => {
      if (!messageData) return null;
      try {
        return MonoMessage.fromPlainObject(messageData);
      } catch (error) {
        console.warn(`Failed to construct message from data:`, error);
        return null;
      }
    })
    .filter((message): message is MonoMessage => message !== null);

  await tx.done;
  return messages;
}
