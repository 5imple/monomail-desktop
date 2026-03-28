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

export async function DBUpdateContact(
  uid: string,
  contactId: string,
  updatedContact: Partial<Contact>
) {
  const db = await initDB(uid);
  const tx = db.transaction('contacts', 'readwrite');
  const contactsStore = tx.objectStore('contacts');

  const contactData = await contactsStore.get(contactId);

  if (contactData) {
    const updatedData = { ...contactData, ...updatedContact };
    await contactsStore.put(updatedData);
  } else {
    //
  }

  await tx.done;
}

export async function DBRemoveContactbyID(uid: string, contactId: string) {
  const db = await initDB(uid);
  const tx = db.transaction('contacts', 'readwrite');
  const contactsStore = tx.objectStore('contacts');

  await contactsStore.delete(contactId);
  await tx.done;
}

export async function DBUpdateContactThreadIds(
  uid: string,
  contactId: string,
  newThreadIds: string[]
) {
  const db = await initDB(uid);
  const tx = db.transaction('contacts', 'readwrite');
  const contactsStore = tx.objectStore('contacts');

  const contactData = await contactsStore.get(contactId);

  if (contactData) {
    contactData.threadIds = newThreadIds;
    await contactsStore.put(contactData);
  } else {
    //
  }

  await tx.done;
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

export function isHumanEmail(email: string): boolean {
  const disposableDomains = new Set([
    'mailinator.com',
    '10minutemail.com',
    'temp-mail.org',
    'guerrillamail.com',
    'trashmail.com'
  ]);

  const roleBasedTerms = new Set([
    'abuse',
    'admin',
    'administrator',
    'billing',
    'compliance',
    'contact',
    'devnull',
    'dns',
    'do-not-reply',
    'donotreply',
    'do_not_reply',
    'email',
    'ftp',
    'help',
    'hostmaster',
    'info',
    'inoc',
    'ispfeedback',
    'ispsupport',
    'list',
    'list-request',
    'mail',
    'maildaemon',
    'mailer-daemon',
    'marketing',
    'messenger',
    'news',
    'noc',
    'no-reply',
    'no_reply',
    'noreply',
    'null',
    'phish',
    'phishing',
    'postmaster',
    'privacy',
    'registrar',
    'root',
    'sales',
    'security',
    'spam',
    'support',
    'sysadmin',
    'undisclosed-recipients',
    'unsubscribe',
    'usenet',
    'webmaster',
    'website',
    'www',
    'www-data',
    'service',
    'customerservice',
    'office',
    'order',
    'orders',
    'feedback',
    'social',
    'career',
    'jobs',
    'newsletter',
    'press',
    'press-office',
    'investor',
    'investors',
    'investor-relations',
    'comms',
    'communications',
    'events',
    'legal',
    'recruitment',
    'team',
    'hr',
    'human-resources',
    'careers',
    'media',
    'operations',
    'partners',
    'partnerships',
    'pr',
    'enquiries',
    'helpdesk',
    'notifications',
    'alerts',
    'email-notifications'
  ]);

  const [localPartRaw, domainRaw] = email.split('@');
  if (!localPartRaw || !domainRaw) return false;

  const localPart = localPartRaw.toLowerCase();
  const domain = domainRaw.toLowerCase();

  const domainParts = domain.split('.');
  const topLevelDomain = domainParts.slice(-2).join('.');

  const isDisposable = disposableDomains.has(topLevelDomain);

  const isRoleBased = Array.from(roleBasedTerms).some((term) => localPart.includes(term));

  const nameRegex = /^[a-z0-9]+([._+-][a-z0-9]+)*$/i;

  const looksLikeName = nameRegex.test(localPart);
  const isNumericOnly = /^[0-9]+$/.test(localPart);

  const isTooLong = localPart.length > 64;

  return !isDisposable && !isRoleBased && looksLikeName && !isNumericOnly && !isTooLong;
}
