import { MonoCacheDB } from '@/renderer/app/lib/db/db';
import { IDBPDatabase } from 'idb';

export function upgradeToVersion1(db: IDBPDatabase<MonoCacheDB>, transaction: IDBTransaction) {
  // Contacts store
  const contactsStore = db.createObjectStore('contacts', {
    keyPath: 'contactId'
  });
  contactsStore.createIndex('byEmailAddress', 'emailAddress');
  contactsStore.createIndex('byPinned', 'pinned');
  contactsStore.createIndex('byPinOrder', 'pinOrder');
  contactsStore.createIndex('byLastReceivedMessageTimestamp', 'lastReceivedMessageTimestamp');
  contactsStore.createIndex('byLastSentMessageTimestamp', 'lastSentMessageTimestamp');

  // Threads store
  const threadStore = db.createObjectStore('threads', { keyPath: 'id' });
  threadStore.createIndex('byThreadId', 'id');
  threadStore.createIndex('byTimestamp', 'timestamp');
  threadStore.createIndex('byLabelIds', 'labelIds', { multiEntry: true });

  // Threads store
  const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
  messageStore.createIndex('byThreadId', 'threadId');
  messageStore.createIndex('byTimestamp', 'timestamp');
  messageStore.createIndex('byMessageId', 'id');

  // Drafts store
  const draftsStore = db.createObjectStore('drafts', {
    keyPath: 'id'
  });
  draftsStore.createIndex('byThreadId', 'threadId');
  draftsStore.createIndex('byMessageId', 'messageId');
  draftsStore.createIndex('byTimestamp', 'timestamp');
  draftsStore.createIndex('byDraftId', 'id');
}
