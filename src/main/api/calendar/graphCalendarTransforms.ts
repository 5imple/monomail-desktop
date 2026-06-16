import {
  CalendarEventResponse,
  CreateCalendarEventRequest,
  GoogleCalendarEvent,
  UpdateCalendarEventRequest
} from '@/main/api/calendar/types';

// ── Microsoft Graph calendar shapes ───────────────────────────────────────────

export interface GraphDateTimeTimeZone {
  // Graph local datetime with no offset, e.g. "2026-06-16T09:00:00.0000000".
  dateTime?: string;
  timeZone?: string; // e.g. "UTC"
}

export interface GraphEmailAddress {
  name?: string;
  address?: string;
}

export interface GraphAttendee {
  type?: string; // required | optional | resource
  status?: { response?: string; time?: string };
  emailAddress?: GraphEmailAddress;
}

export interface GraphEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  isAllDay?: boolean;
  isCancelled?: boolean;
  location?: { displayName?: string };
  attendees?: GraphAttendee[];
  organizer?: { emailAddress?: GraphEmailAddress };
  webLink?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  responseStatus?: { response?: string };
  iCalUId?: string;
  seriesMasterId?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

export interface GraphCalendarViewResponse {
  value?: GraphEvent[];
  '@odata.nextLink'?: string;
}

// Graph attendee/response status → Google responseStatus vocabulary.
const RESPONSE_TO_GOOGLE: Record<string, string> = {
  none: 'needsAction',
  notresponded: 'needsAction',
  organizer: 'accepted',
  accepted: 'accepted',
  tentativelyaccepted: 'tentative',
  declined: 'declined'
};

export function mapGraphResponseToGoogle(response?: string): string {
  return RESPONSE_TO_GOOGLE[(response ?? '').toLowerCase()] ?? 'needsAction';
}

// Google RSVP verb → Graph response action.
export const RSVP_TO_GRAPH_ACTION: Record<string, 'accept' | 'decline' | 'tentativelyAccept'> = {
  accepted: 'accept',
  declined: 'decline',
  tentative: 'tentativelyAccept'
};

/**
 * Graph returns calendarView times as a local datetime with a separate timeZone
 * and NO offset (default UTC). Make it `Date.parse`-correct: append `Z` when the
 * string carries no zone, so the renderer's epoch conversion is right.
 */
export function toParsableDateTime(dt?: GraphDateTimeTimeZone): string | null {
  const raw = dt?.dateTime;
  if (!raw) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) return raw;
  return `${raw}Z`;
}

const EMPTY_CONFERENCE_DATA: GoogleCalendarEvent['conferenceData'] = {
  conferenceId: '',
  conferenceSolution: { iconUri: '', key: { type: '' }, name: '' },
  entryPoints: []
};

/**
 * Microsoft Graph event → the app's GoogleCalendarEvent model (the shape the
 * calendar UI consumes). All-day events use `date`; timed events use a
 * Date.parse-able `dateTime`. The current user is matched by email in the UI, so
 * `self` is not load-bearing here.
 */
export function transformGraphEvent(event: GraphEvent): GoogleCalendarEvent {
  const allDay = !!event.isAllDay;
  const organizerEmail = event.organizer?.emailAddress?.address ?? '';

  const dateInfo = (dt?: GraphDateTimeTimeZone): GoogleCalendarEvent['start'] =>
    allDay
      ? { dateTime: null, date: (dt?.dateTime ?? '').split('T')[0] || null, timeZone: dt?.timeZone ?? null }
      : { dateTime: toParsableDateTime(dt), date: null, timeZone: dt?.timeZone ?? 'UTC' };

  return {
    id: event.id,
    summary: event.subject ?? '(No subject)',
    description: event.body?.content ?? event.bodyPreview ?? '',
    location: event.location?.displayName ?? '',
    start: dateInfo(event.start),
    end: dateInfo(event.end),
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.emailAddress?.address ?? '',
      name: attendee.emailAddress?.name ?? '',
      responseStatus: mapGraphResponseToGoogle(attendee.status?.response),
      organizer: (attendee.emailAddress?.address ?? '') === organizerEmail && organizerEmail !== '',
      self: false
    })) as GoogleCalendarEvent['attendees'],
    organizer: { email: organizerEmail },
    creator: { email: organizerEmail },
    htmlLink: event.webLink ?? '',
    hangoutLink: event.onlineMeeting?.joinUrl ?? '',
    status: event.isCancelled ? 'cancelled' : 'confirmed',
    conferenceData: EMPTY_CONFERENCE_DATA,
    created: event.createdDateTime ?? '',
    updated: event.lastModifiedDateTime ?? '',
    etag: '',
    eventType: 'default',
    iCalUID: event.iCalUId ?? '',
    kind: 'calendar#event',
    originalStartTime: { dateTime: null, date: null, timeZone: null },
    recurringEventId: event.seriesMasterId ?? '',
    reminders: { useDefault: true },
    sequence: 0
  };
}

// ── Request body builders (create / update) ───────────────────────────────────

function graphDateTime(epochMs: number, timeZone: string): GraphDateTimeTimeZone {
  // Send UTC; Graph stores against the given timeZone label.
  return { dateTime: new Date(epochMs).toISOString(), timeZone: timeZone || 'UTC' };
}

function graphDate(epochMs: number): GraphDateTimeTimeZone {
  return { dateTime: `${new Date(epochMs).toISOString().split('T')[0]}T00:00:00`, timeZone: 'UTC' };
}

/** CreateCalendarEventRequest → Graph `POST /me/events` body. */
export function buildGraphCreateBody(request: CreateCalendarEventRequest): Record<string, unknown> {
  const tz = request.timeZone || 'UTC';
  const body: Record<string, unknown> = {
    subject: request.summary,
    isAllDay: !!request.allDay,
    start: request.allDay ? graphDate(request.startTime) : graphDateTime(request.startTime, tz),
    end: request.allDay ? graphDate(request.endTime) : graphDateTime(request.endTime, tz)
  };
  if (request.description) {
    body.body = { contentType: 'HTML', content: request.description };
  }
  if (request.location) {
    body.location = { displayName: request.location };
  }
  if (request.attendees?.length) {
    body.attendees = request.attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required'
    }));
  }
  return body;
}

/** UpdateCalendarEventRequest → Graph `PATCH /me/events/{id}` body (only set fields). */
export function buildGraphUpdateBody(request: UpdateCalendarEventRequest): Record<string, unknown> {
  const tz = request.timeZone || 'UTC';
  const body: Record<string, unknown> = {};
  if (request.summary !== undefined) body.subject = request.summary;
  if (request.allDay !== undefined) body.isAllDay = request.allDay;
  if (request.startTime !== undefined) {
    body.start = request.allDay ? graphDate(request.startTime) : graphDateTime(request.startTime, tz);
  }
  if (request.endTime !== undefined) {
    body.end = request.allDay ? graphDate(request.endTime) : graphDateTime(request.endTime, tz);
  }
  if (request.description !== undefined) {
    body.body = { contentType: 'HTML', content: request.description };
  }
  if (request.location !== undefined) {
    body.location = { displayName: request.location };
  }
  if (request.attendees !== undefined) {
    body.attendees = (request.attendees ?? []).map((email) => ({
      emailAddress: { address: email },
      type: 'required'
    }));
  }
  return body;
}

/** Graph event → CalendarEventResponse (create/update return shape). */
export function transformGraphEventToResponse(event: GraphEvent): CalendarEventResponse {
  const full = transformGraphEvent(event);
  return {
    id: full.id,
    status: full.status,
    summary: full.summary,
    description: full.description,
    location: full.location,
    htmlLink: full.htmlLink,
    start: full.start,
    end: full.end,
    attendees: full.attendees,
    creator: full.creator,
    organizer: full.organizer,
    created: { value: Date.parse(event.createdDateTime ?? '') || 0, dateOnly: false, timeZoneShift: 0 },
    updated: { value: Date.parse(event.lastModifiedDateTime ?? '') || 0, dateOnly: false, timeZoneShift: 0 }
  };
}
