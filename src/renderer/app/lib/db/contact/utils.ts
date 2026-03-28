import { MonoMessage } from '@/main/models/message/MonoMessage';
import { Contact } from '@/renderer/app/lib/db/contact';
import { MonoCacheDB } from '@/renderer/app/lib/db/db';
import { IDBPTransaction } from 'idb';

export async function updateContactForMessage(
  tx: IDBPTransaction<MonoCacheDB, string[], 'readwrite'>,
  uid: string,
  message: MonoMessage,
  threadId: string
) {
  const contactsStore = tx.objectStore('contacts');
  const emailAddress = message.from.email;
  const contact = await contactsStore.get(`contact-${emailAddress}`);

  if (!contact) {
    const newContact: Contact = {
      contactId: `contact-${emailAddress}`,
      emailAddress,
      flags: [],
      lastReceivedMessageTimestamp: message.timestamp,
      lastSentMessageTimestamp: 0,
      messagesReceived: 1,
      messagesSent: 0,
      displayName: message.from.name,
      normalizedEmailAddress: emailAddress.toLowerCase(),
      threadIds: [threadId]
    };
    await contactsStore.put(newContact);
  } else {
    contact.messagesReceived += 1;
    contact.lastReceivedMessageTimestamp = Math.max(
      contact.lastReceivedMessageTimestamp,
      message.timestamp
    );
    contact.threadIds = Array.from(new Set([...contact.threadIds, threadId]));
    await contactsStore.put(contact);
  }
}
