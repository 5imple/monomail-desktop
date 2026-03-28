import { apiClient } from '@/main/api/apiClient';
import {
  CalendarRsvpRequest,
  CalendarRsvpResponse,
  GetGoogleCalendarEventsOptions,
  GoogleCalendarEventsResponse,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarEventResponse
} from '@/main/api/calendar/types';

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

  const params = new URLSearchParams({
    calendarId: calendarId,
    timeMin: timeMin || '',
    timeMax: timeMax || '',
    pageToken: pageToken || '',
    maxResults: maxResults.toString(),
    orderBy,
    singleEvents: 'true' // Required to flatten recurring events
  });

  return apiClient.get<GoogleCalendarEventsResponse>(`/calendar/events?${params.toString()}`, {
    signal,
    // Ensure account header is present for multi-account setups
    ...(options.uid ? { uid: options.uid } : {})
  });
};

/**
 * Send RSVP response to a calendar event invitation
 * @param {CalendarRsvpRequest} request - The RSVP request parameters
 * @returns {Promise<CalendarRsvpResponse>} The response from the API
 */
const sendEventRsvp = async (request: CalendarRsvpRequest): Promise<CalendarRsvpResponse> => {
  return apiClient.post<CalendarRsvpResponse>('/calendar/events/rsvp', request);
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
  return apiClient.post<CalendarEventResponse>('/calendar/events', body, {
    ...(uid ? { uid } : {})
  });
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
  return apiClient.put<CalendarEventResponse>(`/calendar/events/${eventId}`, body, {
    ...(uid ? { uid } : {})
  });
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
