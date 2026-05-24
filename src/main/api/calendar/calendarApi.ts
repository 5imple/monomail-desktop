import { apiClient, calendarApiClient } from '@/main/api/apiClient';
import {
  CalendarRsvpRequest,
  CalendarRsvpResponse,
  GetGoogleCalendarEventsOptions,
  GoogleCalendarEventsResponse,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarEventResponse
} from '@/main/api/calendar/types';

type TimestampResponse = { value: number; dateOnly: boolean; timeZoneShift: number };
type DateTimeResponse = CalendarEventResponse['start'];

const encodePathSegment = (value: string) => encodeURIComponent(value);

const sendUpdatesValue = (sendNotifications: boolean = true) =>
  sendNotifications ? 'all' : 'none';

const toTimestampResponse = (value: unknown): TimestampResponse => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return {
      value: Number.isNaN(parsed) ? Date.now() : parsed,
      dateOnly: false,
      timeZoneShift: 0
    };
  }

  if (value && typeof value === 'object') {
    const maybeValue = (value as { value?: unknown }).value;
    if (typeof maybeValue === 'number') {
      return {
        value: maybeValue,
        dateOnly: Boolean((value as { dateOnly?: unknown }).dateOnly),
        timeZoneShift:
          typeof (value as { timeZoneShift?: unknown }).timeZoneShift === 'number'
            ? ((value as { timeZoneShift: number }).timeZoneShift ?? 0)
            : 0
      };
    }
  }

  return {
    value: Date.now(),
    dateOnly: false,
    timeZoneShift: 0
  };
};

const toGoogleDate = (value: number): string => {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDateTimeInfo = (value: unknown): DateTimeResponse => {
  const info = (value ?? {}) as {
    dateTime?: unknown;
    date?: unknown;
    timeZone?: unknown;
  };

  return {
    dateTime: typeof info.dateTime === 'string' ? info.dateTime : null,
    date:
      typeof info.date === 'string' ||
      (info.date !== null && typeof info.date === 'object' && info.date !== undefined)
        ? (info.date as DateTimeResponse['date'])
        : null,
    timeZone: typeof info.timeZone === 'string' ? info.timeZone : null
  };
};

const normalizeCalendarEvent = <T extends CalendarEventResponse>(event: T): T => ({
  ...event,
  start: normalizeDateTimeInfo(event.start),
  end: normalizeDateTimeInfo(event.end),
  created: toTimestampResponse(event.created),
  updated: toTimestampResponse(event.updated)
});

const toEventBody = (
  request: CreateCalendarEventRequest | UpdateCalendarEventRequest
): Record<string, unknown> => {
  const body: Record<string, unknown> = {};

  if (request.summary !== undefined) body.summary = request.summary;
  if (request.description !== undefined) body.description = request.description;
  if (request.location !== undefined) body.location = request.location;

  const timeZone = request.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (request.startTime !== undefined) {
    body.start =
      request.allDay === true
        ? { date: toGoogleDate(request.startTime) }
        : {
            dateTime: new Date(request.startTime).toISOString(),
            timeZone
          };
  }
  if (request.endTime !== undefined) {
    body.end =
      request.allDay === true
        ? { date: toGoogleDate(request.endTime) }
        : {
            dateTime: new Date(request.endTime).toISOString(),
            timeZone
          };
  }

  if (request.attendees !== undefined) {
    body.attendees = request.attendees.map((email) => ({ email }));
  }

  if (request.enableReminders !== undefined || request.reminderMinutes !== undefined) {
    body.reminders =
      request.enableReminders === false
        ? { useDefault: false, overrides: [] }
        : request.reminderMinutes?.length
          ? {
              useDefault: false,
              overrides: request.reminderMinutes.map((minutes) => ({ method: 'popup', minutes }))
            }
          : { useDefault: true };
  }

  return body;
};

const toEpochMs = (value: DateTimeResponse): number => {
  if (value.dateTime) {
    const parsed = Date.parse(value.dateTime);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  if (typeof value.date === 'string') {
    const parsed = Date.parse(`${value.date}T00:00:00`);
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  if (value.date && typeof value.date === 'object' && typeof value.date.value === 'number') {
    return value.date.value;
  }

  return Date.now();
};

/**
 * Fetch Google Calendar events with dynamic options
 * @param {GetGoogleCalendarEventsOptions} options - API request options including timeMin, timeMax, pageToken, etc.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GoogleCalendarEventsResponse>} The response from the API.
 */
const getGoogleCalendarEvents = async (
  options: GetGoogleCalendarEventsOptions,
  signal?: AbortSignal
): Promise<GoogleCalendarEventsResponse> => {
  const {
    calendarId = 'primary',
    timeMin,
    timeMax,
    pageToken,
    maxResults = 250,
    orderBy = 'startTime'
  } = options;

  if (!options.uid) {
    const params = new URLSearchParams({
      calendarId,
      timeMin: timeMin || '',
      timeMax: timeMax || '',
      pageToken: pageToken || '',
      maxResults: maxResults.toString(),
      orderBy,
      singleEvents: 'true'
    });

    return apiClient.get<GoogleCalendarEventsResponse>(`/calendar/events?${params.toString()}`, {
      signal
    });
  }

  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    orderBy,
    singleEvents: 'true'
  });
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);
  if (pageToken) params.set('pageToken', pageToken);

  const response = await calendarApiClient.get<GoogleCalendarEventsResponse>(
    `/calendars/${encodePathSegment(calendarId)}/events?${params.toString()}`,
    {
      signal,
      uid: options.uid
    }
  );

  return {
    ...response,
    items: (response.items ?? []).map((event) =>
      normalizeCalendarEvent(event as unknown as CalendarEventResponse)
    ) as GoogleCalendarEventsResponse['items']
  };
};

/**
 * Send RSVP response to a calendar event invitation
 * @param {CalendarRsvpRequest} request - The RSVP request parameters
 * @returns {Promise<CalendarRsvpResponse>} The response from the API
 */
const sendEventRsvp = async (request: CalendarRsvpRequest): Promise<CalendarRsvpResponse> => {
  if (!request.uid) {
    return apiClient.post<CalendarRsvpResponse>('/calendar/events/rsvp', request);
  }

  const calendarId = request.calendarId || 'primary';
  const eventPath = `/calendars/${encodePathSegment(calendarId)}/events/${encodePathSegment(
    request.eventId
  )}`;
  const event = normalizeCalendarEvent(
    await calendarApiClient.get<CalendarEventResponse>(eventPath, {
      uid: request.uid
    })
  );
  const attendees = event.attendees ?? [];
  const selfAttendee = attendees.find((attendee) => attendee.self);

  if (!selfAttendee) {
    throw new Error('Could not find the current account attendee on this calendar event.');
  }

  const updated = normalizeCalendarEvent(
    await calendarApiClient.patch<CalendarEventResponse>(
      `${eventPath}?sendUpdates=${sendUpdatesValue(request.sendNotifications)}`,
      {
        attendees: attendees.map((attendee) =>
          attendee === selfAttendee
            ? { ...attendee, responseStatus: request.responseStatus }
            : attendee
        )
      },
      {
        uid: request.uid
      }
    )
  );

  return {
    id: updated.id,
    status: updated.status,
    summary: updated.summary,
    description: updated.description,
    location: updated.location,
    htmlLink: updated.htmlLink,
    start: {
      dateTime: toEpochMs(updated.start),
      timeZone: updated.start.timeZone || ''
    },
    end: {
      dateTime: toEpochMs(updated.end),
      timeZone: updated.end.timeZone || ''
    },
    attendees: (updated.attendees ?? []).map((attendee) => ({
      email: attendee.email,
      responseStatus: attendee.responseStatus
    })),
    creator: updated.creator?.email || '',
    organizer: updated.organizer?.email || ''
  };
};

/**
 * Create a new calendar event
 * @param {CreateCalendarEventRequest} request - The event creation request parameters
 * @returns {Promise<CalendarEventResponse>} The response from the API
 */
const createCalendarEvent = async (
  request: CreateCalendarEventRequest
): Promise<CalendarEventResponse> => {
  // Exclude uid from the JSON body; it's used to set X-Mono-Account header
  const { uid, ...body } = request as CreateCalendarEventRequest & { [key: string]: any };
  if (!uid) {
    return apiClient.post<CalendarEventResponse>('/calendar/events', body);
  }

  const calendarId = request.calendarId || 'primary';
  const params = new URLSearchParams({
    sendUpdates: sendUpdatesValue(request.sendNotifications)
  });

  const response = await calendarApiClient.post<CalendarEventResponse>(
    `/calendars/${encodePathSegment(calendarId)}/events?${params.toString()}`,
    toEventBody(request),
    { uid }
  );

  return normalizeCalendarEvent(response);
};

/**
 * Update an existing calendar event
 * @param {UpdateCalendarEventRequest} request - The event update request parameters
 * @returns {Promise<CalendarEventResponse>} The response from the API
 */
const updateCalendarEvent = async (
  request: UpdateCalendarEventRequest
): Promise<CalendarEventResponse> => {
  const { uid, eventId, ...body } = request as UpdateCalendarEventRequest & {
    [key: string]: any;
  };
  if (!uid) {
    return apiClient.put<CalendarEventResponse>(`/calendar/events/${eventId}`, body);
  }

  const calendarId = request.calendarId || 'primary';
  const params = new URLSearchParams({
    sendUpdates: sendUpdatesValue(request.sendNotifications)
  });

  const response = await calendarApiClient.patch<CalendarEventResponse>(
    `/calendars/${encodePathSegment(calendarId)}/events/${encodePathSegment(
      eventId
    )}?${params.toString()}`,
    toEventBody(request),
    { uid }
  );

  return normalizeCalendarEvent(response);
};

/**
 * Delete a calendar event
 * @param {string} eventId - The event ID to delete
 * @param {string} calendarId - The calendar ID (defaults to 'primary')
 * @param {string} uid - The user ID for multi-account setups
 * @param {boolean} sendNotifications - Whether to send notifications to attendees
 * @returns {Promise<void>} The response from the API
 */
const deleteCalendarEvent = async (
  eventId: string,
  calendarId: string = 'primary',
  uid?: string,
  sendNotifications: boolean = true
): Promise<void> => {
  const params = new URLSearchParams({
    calendarId,
    sendNotifications: sendNotifications.toString()
  });

  if (uid) {
    const directParams = new URLSearchParams({
      sendUpdates: sendUpdatesValue(sendNotifications)
    });
    return calendarApiClient.delete(
      `/calendars/${encodePathSegment(calendarId)}/events/${encodePathSegment(
        eventId
      )}?${directParams.toString()}`,
      { uid }
    );
  }

  return apiClient.delete(`/calendar/events/${eventId}?${params.toString()}`, {
    ...(uid ? { uid } : {})
  });
};

export default {
  getGoogleCalendarEvents,
  sendEventRsvp,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent
};
