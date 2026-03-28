export interface GetGoogleCalendarEventsOptions {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
  pageToken?: string;
  maxResults?: number;
  orderBy?: 'startTime' | 'updated';
  // When provided, requests will include `X-Mono-Account` header for this uid
  uid?: string;
  signal?: AbortSignal;
}
export interface GoogleCalendarEventsResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GoogleCalendarEvent {
  attendees: Attendee[];
  conferenceData: ConferenceData;
  created: Timestamp;
  creator: Creator;
  end: DateTimeInfo;
  etag: string;
  eventType: string;
  hangoutLink: string;
  htmlLink: string;
  iCalUID: string;
  id: string;
  kind: string;
  organizer: Organizer;
  originalStartTime: DateTimeInfo;
  recurringEventId: string;
  reminders: Reminders;
  sequence: number;
  start: DateTimeInfo;
  status: string;
  summary: string;
  location?: string;
  description?: string;
  updated: Timestamp;
}

interface Attendee {
  email: string;
  responseStatus: string;
  organizer?: boolean;
  self?: boolean;
}

interface ConferenceData {
  conferenceId: string;
  conferenceSolution: ConferenceSolution;
  entryPoints: EntryPoint[];
}

interface ConferenceSolution {
  iconUri: string;
  key: SolutionKey;
  name: string;
}

interface SolutionKey {
  type: string;
}

interface EntryPoint {
  entryPointType: string;
  label: string;
  uri: string;
}

interface Timestamp {
  value: number;
  dateOnly: boolean;
  timeZoneShift: number;
}

interface Creator {
  email: string;
}

interface DateTimeInfo {
  dateTime: string | null;
  date?: {
    value: number;
    dateOnly: boolean;
    timeZoneShift: number;
  } | null;
  timeZone: string | null;
}

interface Organizer {
  email: string;
}

interface Reminders {
  useDefault: boolean;
}

/**
 * Interface for calendar RSVP request
 */
export interface CalendarRsvpRequest {
  calendarId: string;
  eventId: string;
  responseStatus: 'accepted' | 'declined' | 'tentative';
  sendNotifications: boolean;
}

/**
 * Interface for calendar RSVP response
 */
export interface CalendarRsvpResponse {
  id: string;
  status: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink: string;
  start: {
    dateTime: number;
    timeZone: string;
  };
  end: {
    dateTime: number;
    timeZone: string;
  };
  attendees: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
  creator: string;
  organizer: string;
}

/**
 * Interface for creating a calendar event (matches backend DTO)
 */
export interface CreateCalendarEventRequest {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  startTime: number; // epoch milliseconds
  endTime: number; // epoch milliseconds
  timeZone: string;
  attendees?: string[]; // list of attendee email addresses
  enableReminders?: boolean;
  reminderMinutes?: number[];
  sendNotifications?: boolean;
  // Not sent in body. Used to set X-Mono-Account header in the API client.
  uid?: string;
}

/**
 * Interface for updating a calendar event
 */
export interface UpdateCalendarEventRequest {
  calendarId?: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  startTime?: number; // epoch milliseconds
  endTime?: number; // epoch milliseconds
  timeZone?: string;
  attendees?: string[];
  enableReminders?: boolean;
  reminderMinutes?: number[];
  sendNotifications?: boolean;
  // Not sent in body. Used to set X-Mono-Account header in the API client.
  uid?: string;
}

/**
 * Interface for calendar event creation/update response
 */
export interface CalendarEventResponse {
  id: string;
  status: string;
  summary: string;
  description?: string;
  location?: string;
  htmlLink: string;
  start: DateTimeInfo;
  end: DateTimeInfo;
  attendees?: Attendee[];
  creator: Creator;
  organizer: Organizer;
  created: Timestamp;
  updated: Timestamp;
  etag?: string;
  sequence?: number;
}
