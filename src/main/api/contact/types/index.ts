import { Contact } from '@/renderer/app/lib/db/contact';

export interface GoogleContactResponse {
  email: string;
  names: {
    displayName?: string;
    familyName?: string;
    givenName?: string;
  };
  profileImageUrl?: string;
}

export interface GetGoogleContactResponse {
  data: Array<GoogleContactResponse>;
}

export function parseGoogleContactToMonoContact(response: GoogleContactResponse): Contact {
  const emailAddress = response.email;
  const displayName = response.names.displayName ?? response.email;
  const givenName = response.names.givenName ?? '';
  const familyName = response.names.familyName ?? '';
  const profileImageUrl = response.profileImageUrl ?? '';
  const normalizedEmailAddress = emailAddress.toLowerCase();

  // Create a Contact object from the parsed API response
  const contact: Contact = {
    contactId: `contact-${response.email}`,
    emailAddress,
    displayName,
    givenName,
    familyName,
    profileImageUrl,
    flags: [],
    lastReceivedMessageTimestamp: 0,
    lastSentMessageTimestamp: 0,
    messagesReceived: 0,
    messagesSent: 0,
    normalizedEmailAddress,
    threadIds: [],
    pinned: undefined
  };

  return contact;
}
