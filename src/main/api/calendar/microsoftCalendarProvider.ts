import { graphApiClient } from '@/main/api/apiClient';
import {
  GraphCalendarViewResponse,
  GraphEvent,
  RSVP_TO_GRAPH_ACTION,
  buildGraphCreateBody,
  buildGraphUpdateBody,
  transformGraphEvent,
  transformGraphEventToResponse
} from '@/main/api/calendar/graphCalendarTransforms';
import {
  CalendarEventResponse,
  CalendarRsvpRequest,
  CalendarRsvpResponse,
  CreateCalendarEventRequest,
  GetGoogleCalendarEventsOptions,
  GoogleCalendarEventsResponse,
  UpdateCalendarEventRequest
} from '@/main/api/calendar/types';

const CALENDAR_SELECT =
  'id,subject,bodyPreview,body,start,end,isAllDay,isCancelled,location,attendees,organizer,' +
  'webLink,onlineMeeting,responseStatus,iCalUId,seriesMasterId,createdDateTime,lastModifiedDateTime';

// Defensive cap on calendarView paging (a month window is far under this).
const MAX_PAGES = 20;

const eventPath = (id: string) => `/me/events/${encodeURIComponent(id)}`;

/**
 * Read events over a window. `/me/calendarView` expands recurring series into
 * instances (the Graph analog of Google's `singleEvents: true`).
 */
async function getEvents(
  options: GetGoogleCalendarEventsOptions,
  signal?: AbortSignal
): Promise<GoogleCalendarEventsResponse> {
  const { uid, timeMin, timeMax, maxResults = 250 } = options;
  const params = new URLSearchParams({
    startDateTime: timeMin ?? new Date().toISOString(),
    endDateTime: timeMax ?? new Date().toISOString(),
    $select: CALENDAR_SELECT,
    $orderby: 'start/dateTime',
    $top: String(Math.min(maxResults, 100))
  });

  let path: string | undefined = `/me/calendarView?${params.toString()}`;
  const events: GraphEvent[] = [];
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const resp = await graphApiClient.get<GraphCalendarViewResponse>(path, { uid, signal });
    events.push(...(resp.value ?? []));
    path = resp['@odata.nextLink'];
  }

  return { items: events.map(transformGraphEvent) };
}

/**
 * RSVP via Graph's dedicated response actions (accept / decline /
 * tentativelyAccept), then re-read the event for the updated state.
 */
async function sendRsvp(request: CalendarRsvpRequest): Promise<CalendarRsvpResponse> {
  const action = RSVP_TO_GRAPH_ACTION[request.responseStatus];
  if (!action) throw new Error(`Unsupported RSVP status: ${request.responseStatus}`);

  await graphApiClient.post(
    `${eventPath(request.eventId)}/${action}`,
    { sendResponse: request.sendNotifications !== false },
    { uid: request.uid }
  );

  const updated = await graphApiClient.get<GraphEvent>(
    `${eventPath(request.eventId)}?$select=${CALENDAR_SELECT}`,
    { uid: request.uid }
  );
  const full = transformGraphEvent(updated);
  const toEpoch = (dt: string | null) => (dt ? Date.parse(dt) || 0 : 0);

  return {
    id: full.id,
    status: full.status,
    summary: full.summary,
    description: full.description,
    location: full.location,
    htmlLink: full.htmlLink,
    start: { dateTime: toEpoch(full.start.dateTime), timeZone: full.start.timeZone ?? '' },
    end: { dateTime: toEpoch(full.end.dateTime), timeZone: full.end.timeZone ?? '' },
    attendees: (full.attendees ?? []).map((attendee) => ({
      email: attendee.email,
      responseStatus: attendee.responseStatus
    })),
    creator: full.creator.email,
    organizer: full.organizer.email
  };
}

async function createEvent(request: CreateCalendarEventRequest): Promise<CalendarEventResponse> {
  const created = await graphApiClient.post<GraphEvent>(
    '/me/events',
    buildGraphCreateBody(request),
    { uid: request.uid }
  );
  return transformGraphEventToResponse(created);
}

async function updateEvent(request: UpdateCalendarEventRequest): Promise<CalendarEventResponse> {
  const updated = await graphApiClient.patch<GraphEvent>(
    eventPath(request.eventId),
    buildGraphUpdateBody(request),
    { uid: request.uid }
  );
  return transformGraphEventToResponse(updated);
}

async function deleteEvent(eventId: string, uid?: string): Promise<void> {
  await graphApiClient.delete(eventPath(eventId), { uid });
}

export const microsoftCalendarProvider = {
  getEvents,
  sendRsvp,
  createEvent,
  updateEvent,
  deleteEvent
};
