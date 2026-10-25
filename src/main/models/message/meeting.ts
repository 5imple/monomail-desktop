/**
 * A meeting carried by an email: an invitation, an update, a cancellation, or
 * an attendee's reply. Outlook (Microsoft Graph) delivers these as
 * `eventMessage` items whose body is often empty, since the meeting details
 * live on the message itself and on the calendar event it points at. This is
 * the provider-neutral shape the reader shows for such a message.
 */

export type MonoMeetingKind =
  | 'request' // an invitation (new or updated)
  | 'cancelled'
  | 'accepted'
  | 'tentative'
  | 'declined';

export type MonoMeetingResponse =
  | 'organizer'
  | 'accepted'
  | 'tentative'
  | 'declined'
  | 'none';

export interface MonoMeetingAttendee {
  name: string;
  email: string;
  response: MonoMeetingResponse;
}

export interface MonoMeeting {
  kind: MonoMeetingKind;
  // Calendar event the message points at (needed to RSVP); null when the
  // event is gone from the calendar.
  eventId: string | null;
  subject: string;
  // UTC ISO timestamps; null when unknown.
  start: string | null;
  end: string | null;
  isAllDay: boolean;
  location: string | null;
  joinUrl: string | null;
  organizer: { name: string; email: string } | null;
  attendees: MonoMeetingAttendee[];
  // The mailbox owner's answer so far.
  myResponse: MonoMeetingResponse;
  // A newer request for the same meeting exists; this one no longer applies.
  isOutOfDate: boolean;
  isCancelled: boolean;
  // Attendee's counter-proposal on a decline / tentative reply.
  proposedStart: string | null;
  proposedEnd: string | null;
}

const RESPONSES: Record<string, MonoMeetingResponse> = {
  organizer: 'organizer',
  accepted: 'accepted',
  tentativelyaccepted: 'tentative',
  tentative: 'tentative',
  declined: 'declined'
};

/** Graph's responseType / responseStatus.response → ours (`none` when unknown). */
export const toMeetingResponse = (value: string | null | undefined): MonoMeetingResponse =>
  RESPONSES[(value ?? '').toLowerCase()] ?? 'none';

const KINDS: Record<string, MonoMeetingKind> = {
  meetingrequest: 'request',
  meetingcancelled: 'cancelled',
  meetingaccepted: 'accepted',
  meetingtentativelyaccepted: 'tentative',
  meetingtenativelyaccepted: 'tentative', // Graph's own misspelling of the enum value
  meetingdeclined: 'declined'
};

/** Graph's meetingMessageType → ours; null for `none` and unknown values. */
export const toMeetingKind = (value: string | null | undefined): MonoMeetingKind | null =>
  KINDS[(value ?? '').toLowerCase()] ?? null;
