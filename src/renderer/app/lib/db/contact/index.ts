import { initDB } from '../db';

export interface Contact {
  contactId: string;
  emailAddress: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  profileImageUrl?: string;
  flags: string[];
  lastReceivedMessageTimestamp: number;
  lastSentMessageTimestamp: number;
  messagesReceived: number;
  messagesSent: number;
  normalizedEmailAddress: string;
  threadIds: string[];
  pinned?: boolean;
  pinOrder?: number; // New field for pin order
}

export async function DBCreateContact(uid: string, contact: Contact) {
  const db = await initDB(uid);
  const tx = db.transaction('contacts', 'readwrite');
  const contactsStore = tx.objectStore('contacts');

  if (contact.pinned && contact.pinOrder === undefined) {
    contact.pinOrder = 0; // Assign default order if missing
  }

  await contactsStore.put(contact);
  await tx.done;
}

export async function DBGetContact(uid: string, contactId: string) {
  const db = await initDB(uid);
  return (await db.get('contacts', contactId)) as Contact | null;
}

export async function DBGetContactByEmail(uid: string, emailAddress: string) {
  const db = await initDB(uid);
  const contactsStore = db.transaction('contacts').objectStore('contacts');

  const contacts = await contactsStore.index('byEmailAddress').getAll(emailAddress);

  return contacts as Contact[];
}

export async function DBGetContacts(uid: string) {
  const db = await initDB(uid);
  const contactsStore = db.transaction('contacts').objectStore('contacts');

  const contacts = await contactsStore.index('byEmailAddress').getAll();

  return contacts as Contact[];
}

// TODO
export async function DBUpdateContactPinStatus(
  uid: string,
  contactId: string,
  isPinned: boolean,
  pinOrder?: number
) {
  const db = await initDB(uid);
  const tx = db.transaction('contacts', 'readwrite');
  const contactsStore = tx.objectStore('contacts');

  const contactData = await contactsStore.get(contactId);

  if (contactData) {
    contactData.pinned = isPinned;
    if (pinOrder !== undefined) {
      contactData.pinOrder = pinOrder;
    }
    await contactsStore.put(contactData);
  } else {
    console.error(`Contact with id ${contactId} not found.`);
  }

  await tx.done;
}
