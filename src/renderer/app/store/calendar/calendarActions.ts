import calendarApi from '@/main/api/calendar/calendarApi';
import type { UpdateCalendarEventRequest } from '@/main/api/calendar/types';
import {
  parseEventDate,
  isAllDayFromApiResponse
} from '@/renderer/app/containers/panel/calendar/utils';
import { atom } from 'jotai';
import {
  draftsAtom,
  eventsAtom,
  eventStatusAtom,
  syncEventsToStorageAtom,
  syncDraftsToStorageAtom,
  type CalendarEvent,
  type CalendarEventDraft,
  type CalendarEventID,
  type CalendarEventStatus
} from './calendarAtoms';

// Helper function to update events atom and sync to storage
const updateEventsAndSync = (
  get: any,
  set: any,
  updater: (prev: Record<CalendarEventID, CalendarEvent>) => Record<CalendarEventID, CalendarEvent>
) => {
  const updatedEvents = updater(get(eventsAtom));
  set(eventsAtom, updatedEvents);
  set(syncEventsToStorageAtom, updatedEvents);
};

// Helper function to update drafts atom and sync to storage
const updateDraftsAndSync = (
  get: any,
  set: any,
  updater: (
    prev: Record<CalendarEventID, CalendarEventDraft>
  ) => Record<CalendarEventID, CalendarEventDraft>
) => {
  const updatedDrafts = updater(get(draftsAtom));
  set(draftsAtom, updatedDrafts);
  set(syncDraftsToStorageAtom, updatedDrafts);
};

// ============================================================================
// ACTION ATOMS - Write-only atoms for state mutations
// ============================================================================

/** Load events from server into store */
export const loadEventsAtom = atom(null, (get, set, events: CalendarEvent[]) => {
  const currentEvents = get(eventsAtom);
  const newEvents = { ...currentEvents };

  events.forEach((event) => {
    newEvents[event.id] = event;
    // Set status to synced if not already set
    set(eventStatusAtom, (prev) => ({
      ...prev,
      [event.id]: prev[event.id] || 'synced'
    }));
  });

  set(eventsAtom, newEvents);
  // Sync to storage
  set(syncEventsToStorageAtom, newEvents);
});

/** Create a draft for an event */
export const createDraftAtom = atom(
  null,
  (
    get,
    set,
    {
      eventId,
      changes,
      source = 'user'
    }: {
      eventId: CalendarEventID;
      changes: Partial<CalendarEventDraft>;
      source?: CalendarEventDraft['source'];
    }
  ) => {
    const currentDrafts = get(draftsAtom);
    const existingDraft = currentDrafts[eventId];

    // Merge with existing draft
    const newDraft: CalendarEventDraft = {
      ...existingDraft,
      ...changes,
      updatedAt: Date.now(),
      source
    };

    // Remove undefined values to keep draft clean
    Object.keys(newDraft).forEach((key) => {
      const draftKey = key as keyof CalendarEventDraft;
      if (newDraft[draftKey] === undefined) {
        delete newDraft[draftKey];
      }
    });

    const updatedDrafts = {
      ...currentDrafts,
      [eventId]: newDraft
    };

    set(draftsAtom, updatedDrafts);
    // Sync to storage
    set(syncDraftsToStorageAtom, updatedDrafts);

    // Update status to draft if not already saving/error
    set(eventStatusAtom, (prev) => ({
      ...prev,
      [eventId]: prev[eventId] === 'saving' ? 'saving' : 'draft'
    }));
  }
);

/** Discard draft changes for an event */
export const discardDraftAtom = atom(null, (get, set, eventId: CalendarEventID) => {
  const currentDrafts = get(draftsAtom);
  const { [eventId]: _removed, ...remainingDrafts } = currentDrafts;

  set(draftsAtom, remainingDrafts);
  // Sync to storage
  set(syncDraftsToStorageAtom, remainingDrafts);
  set(eventStatusAtom, (prev) => ({
    ...prev,
    [eventId]: 'synced'
  }));
});

/** Apply draft changes to server */
export const applyDraftAtom = atom(
  null,
  async (
    get,
    set,
    {
      eventId,
      sendNotifications = true,
      userAccounts = []
    }: {
      eventId: CalendarEventID;
      sendNotifications?: boolean;
      userAccounts?: Array<{ uid: string; email: string }>;
    }
  ) => {
    const events = get(eventsAtom);
    const drafts = get(draftsAtom);

    const event = events[eventId];
    const draft = drafts[eventId];

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    if (!draft) {
      // No changes to apply
      return;
    }

    // Ensure event has accountUid
    if (!event.accountUid) {
      throw new Error(`Event ${eventId} missing accountUid`);
    }

    // Mark as saving
    set(eventStatusAtom, (prev) => ({
      ...prev,
      [eventId]: 'saving'
    }));

    try {
      // Merge event with draft changes
      const mergedEvent: CalendarEvent = {
        ...event,
        ...draft,
        id: eventId,
        accountUid: event.accountUid, // Preserve accountUid
        updated: new Date(draft.updatedAt),
        // Ensure allDay property is properly merged from draft
        allDay: draft.allDay !== undefined ? draft.allDay : event.allDay,
        start: {
          dateTime: draft.start?.dateTime ?? event.start.dateTime,
          date: draft.start?.date ?? event.start.date,
          timeZone: draft.start?.timeZone ?? event.start.timeZone
        },
        end: {
          dateTime: draft.end?.dateTime ?? event.end.dateTime,
          date: draft.end?.date ?? event.end.date,
          timeZone: draft.end?.timeZone ?? event.end.timeZone
        }
      };

      // Get list of removed attendee emails from draft for optimistic update
      const removedAttendeeEmails = draft.removedAttendeeEmails || [];
      const removedEmailsSet = new Set(removedAttendeeEmails.map((email) => email.toLowerCase()));

      // Optimistically update the event state immediately to remove attendees from UI
      const optimisticAttendees = mergedEvent.attendees.filter((a) => {
        // Keep organizer and current user
        if (a.isOrganizer) return true;
        // Remove attendees that were marked as removed
        return !removedEmailsSet.has(a.email.toLowerCase());
      });

      const updatedEvents = {
        ...get(eventsAtom),
        [eventId]: {
          ...mergedEvent,
          attendees: optimisticAttendees
        }
      };
      set(eventsAtom, updatedEvents);
      // Sync to storage
      set(syncEventsToStorageAtom, updatedEvents);

      // Get the organizer email for this event's account
      const eventAccount = userAccounts.find((acc) => acc.uid === mergedEvent.accountUid);
      const organizerEmail = eventAccount?.email;

      // Filter attendees for API call (exclude organizer and removed attendees)
      const filteredAttendees = mergedEvent.attendees.filter((a) => {
        // Exclude if marked as organizer
        if (a.isOrganizer) return false;
        // Exclude if email matches the organizer email (current user)
        if (organizerEmail && a.email === organizerEmail) return false;
        // Exclude if this attendee was removed in the draft
        if (removedEmailsSet.has(a.email.toLowerCase())) return false;
        return true;
      });

      // Convert to API format
      const updateRequest: UpdateCalendarEventRequest = {
        eventId,
        summary: mergedEvent.title,
        description: mergedEvent.description,
        location: mergedEvent.location,
        startTime: mergedEvent.allDay
          ? (parseEventDate(mergedEvent.start.date) || new Date()).getTime()
          : (parseEventDate(mergedEvent.start.dateTime) || new Date()).getTime(),
        endTime: mergedEvent.allDay
          ? (parseEventDate(mergedEvent.end.date) || new Date()).getTime()
          : (parseEventDate(mergedEvent.end.dateTime) || new Date()).getTime(),
        // Only include timeZone for timed events
        ...(mergedEvent.allDay ? {} : { timeZone: mergedEvent.timezone }),
        attendees: filteredAttendees.map((a) => a.email),
        sendNotifications,
        uid: mergedEvent.accountUid // Use the event's accountUid
      };

      // Call API
      const response = await calendarApi.updateCalendarEvent(updateRequest);

      // Reconstruct the event from the API response to ensure correct structure
      const reconstructedEvent: CalendarEvent = {
        id: eventId,
        accountUid: mergedEvent.accountUid,
        title: response.summary || mergedEvent.title,
        summary: response.summary || mergedEvent.summary,
        description: response.description || mergedEvent.description,
        location: response.location || mergedEvent.location,
        start: {
          dateTime: response.start.dateTime,
          date: response.start.date,
          timeZone: response.start.timeZone
        },
        end: {
          dateTime: response.end.dateTime,
          date: response.end.date,
          timeZone: response.end.timeZone
        },
        timezone: response.start.timeZone || mergedEvent.timezone,
        // Determine allDay from the API response structure
        allDay: isAllDayFromApiResponse(response.start, response.end),
        attendees:
          response.attendees?.map((attendee) => ({
            email: attendee.email,
            name: attendee.email, // API Attendee doesn't have displayName
            response:
              (attendee.responseStatus as 'accepted' | 'tentative' | 'declined' | 'needsAction') ||
              'needsAction',
            isOrganizer: attendee.organizer || false
          })) || mergedEvent.attendees,
        etag: response.etag || mergedEvent.etag,
        htmlLink: response.htmlLink || mergedEvent.htmlLink,
        status: (response.status as 'confirmed' | 'tentative' | 'cancelled') || mergedEvent.status,
        sequence: response.sequence || mergedEvent.sequence,
        created: new Date(response.created?.value || mergedEvent.created.getTime()),
        updated: new Date(response.updated?.value || Date.now()),
        conferenceData: mergedEvent.conferenceData
      };

      // Update server state with reconstructed event
      updateEventsAndSync(get, set, (prev) => ({
        ...prev,
        [eventId]: reconstructedEvent
      }));

      // Clear draft and mark as synced
      set(discardDraftAtom, eventId);
    } catch (error) {
      // Revert optimistic update on error - restore original event state
      updateEventsAndSync(get, set, (prev) => ({
        ...prev,
        [eventId]: event // Restore original event state
      }));

      // Mark as error
      set(eventStatusAtom, (prev) => ({
        ...prev,
        [eventId]: 'error'
      }));
      throw error;
    }
  }
);

/** Create a new event */
export const createEventAtom = atom(
  null,
  async (
    get,
    set,
    {
      eventData,
      userAccounts = []
    }: {
      eventData: Omit<CalendarEvent, 'id' | 'etag' | 'sequence' | 'created' | 'updated'>;
      userAccounts?: Array<{ uid: string; email: string }>;
    }
  ) => {
    // Ensure eventData has accountUid
    if (!eventData.accountUid) {
      throw new Error('Event data missing accountUid');
    }

    // Generate temporary ID
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create temporary event in store
    const tempEvent: CalendarEvent = {
      ...eventData,
      id: tempId,
      accountUid: eventData.accountUid, // Ensure accountUid is preserved
      etag: '',
      sequence: 0,
      created: new Date(),
      updated: new Date()
    };

    updateEventsAndSync(get, set, (prev) => ({
      ...prev,
      [tempId]: tempEvent
    }));

    set(eventStatusAtom, (prev) => ({
      ...prev,
      [tempId]: 'saving'
    }));

    try {
      // Get the organizer email for this event's account
      const eventAccount = userAccounts.find((acc) => acc.uid === eventData.accountUid);
      const organizerEmail = eventAccount?.email;

      // Filter out organizer from attendees - use both isOrganizer flag and email comparison
      // Note: For new events, removedAttendeeEmails shouldn't exist, but keeping consistent logic
      const filteredAttendees = eventData.attendees.filter((a) => {
        // Exclude if marked as organizer
        if (a.isOrganizer) return false;
        // Exclude if email matches the organizer email (current user)
        if (organizerEmail && a.email === organizerEmail) return false;
        return true;
      });

      // Convert to API format and create
      const response = await calendarApi.createCalendarEvent({
        calendarId: 'primary',
        summary: tempEvent.title,
        description: tempEvent.description,
        location: tempEvent.location,
        startTime: tempEvent.allDay
          ? (parseEventDate(tempEvent.start.date) || new Date()).getTime()
          : (parseEventDate(tempEvent.start.dateTime) || new Date()).getTime(),
        endTime: tempEvent.allDay
          ? (parseEventDate(tempEvent.end.date) || new Date()).getTime()
          : (parseEventDate(tempEvent.end.dateTime) || new Date()).getTime(),
        // Always provide timeZone - use event timezone or default to system timezone
        timeZone: tempEvent.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendees: filteredAttendees.map((a) => a.email),
        uid: eventData.accountUid // Use the event's accountUid
      });

      // Replace temp event with real one reconstructed from API response
      const { [tempId]: _removedTemp, ...remainingEvents } = get(eventsAtom);
      const realEvent: CalendarEvent = {
        id: response.id,
        accountUid: eventData.accountUid,
        title: response.summary || tempEvent.title,
        summary: response.summary || tempEvent.summary,
        description: response.description || tempEvent.description,
        location: response.location || tempEvent.location,
        start: {
          dateTime: response.start.dateTime,
          date: response.start.date,
          timeZone: response.start.timeZone
        },
        end: {
          dateTime: response.end.dateTime,
          date: response.end.date,
          timeZone: response.end.timeZone
        },
        timezone: response.start.timeZone || tempEvent.timezone,
        // Determine allDay from the API response structure
        allDay: isAllDayFromApiResponse(response.start, response.end),
        attendees:
          response.attendees?.map((attendee) => ({
            email: attendee.email,
            name: attendee.email, // API Attendee doesn't have displayName
            response:
              (attendee.responseStatus as 'accepted' | 'tentative' | 'declined' | 'needsAction') ||
              'needsAction',
            isOrganizer: attendee.organizer || false
          })) || tempEvent.attendees,
        etag: response.etag || '',
        htmlLink: response.htmlLink || tempEvent.htmlLink,
        status: (response.status as 'confirmed' | 'tentative' | 'cancelled') || tempEvent.status,
        sequence: response.sequence || 0,
        created: new Date(response.created?.value || Date.now()),
        updated: new Date(response.updated?.value || Date.now()),
        conferenceData: tempEvent.conferenceData
      };

      updateEventsAndSync(get, set, (prev) => ({
        ...remainingEvents,
        [response.id]: realEvent
      }));

      // Update status
      const { [tempId]: _removedStatus, ...remainingStatus } = get(eventStatusAtom);
      set(eventStatusAtom, {
        ...remainingStatus,
        [response.id]: 'synced'
      });

      return response.id;
    } catch (error) {
      // Mark temp event as error
      set(eventStatusAtom, (prev) => ({
        ...prev,
        [tempId]: 'error'
      }));
      throw error;
    }
  }
);

/** Delete an event */
export const deleteEventAtom = atom(
  null,
  async (
    get,
    set,
    {
      eventId,
      sendNotifications = true
    }: {
      eventId: CalendarEventID;
      sendNotifications?: boolean;
    }
  ) => {
    const events = get(eventsAtom);
    const event = events[eventId];

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Ensure event has accountUid
    if (!event.accountUid) {
      throw new Error(`Event ${eventId} missing accountUid`);
    }

    // Mark as deleting
    set(eventStatusAtom, (prev) => ({
      ...prev,
      [eventId]: 'deleting'
    }));

    try {
      // Call API with the event's accountUid
      await calendarApi.deleteCalendarEvent(
        eventId,
        'primary',
        event.accountUid, // Use the event's accountUid
        sendNotifications
      );

      // Remove from store
      const { [eventId]: _removed, ...remainingEvents } = get(eventsAtom);
      updateEventsAndSync(get, set, () => remainingEvents);

      // Remove from drafts if exists
      const { [eventId]: _removedDraft, ...remainingDrafts } = get(draftsAtom);
      updateDraftsAndSync(get, set, () => remainingDrafts);

      // Mark as deleted
      set(eventStatusAtom, (prev) => ({
        ...prev,
        [eventId]: 'deleted'
      }));
    } catch (error) {
      // Revert to previous status on error
      set(eventStatusAtom, (prev) => ({
        ...prev,
        [eventId]: 'error'
      }));
      throw error;
    }
  }
);

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/** Clear all events (for account switching) */
export const clearEventsAtom = atom(null, (get, set, accountUids?: string[]) => {
  if (!accountUids) {
    // Clear all
    updateEventsAndSync(get, set, () => ({}));
    updateDraftsAndSync(get, set, () => ({}));
    set(eventStatusAtom, {});
    return;
  }

  // Clear only specific accounts
  const events = get(eventsAtom);
  const drafts = get(draftsAtom);
  const status = get(eventStatusAtom);

  const filteredEvents: Record<string, CalendarEvent> = {};
  const filteredDrafts: Record<string, CalendarEventDraft> = {};
  const filteredStatus: Record<string, CalendarEventStatus> = {};

  Object.entries(events).forEach(([id, event]) => {
    if (!accountUids.includes(event.accountUid)) {
      filteredEvents[id] = event;
      if (drafts[id]) filteredDrafts[id] = drafts[id];
      if (status[id]) filteredStatus[id] = status[id];
    }
  });

  updateEventsAndSync(get, set, () => filteredEvents);
  updateDraftsAndSync(get, set, () => filteredDrafts);
  set(eventStatusAtom, filteredStatus);
});

// ============================================================================
// HELPERS
// ============================================================================

/** Check if event has attendees (excluding organizer) */
export const hasAttendeesAtom = atom((get) => (eventId: CalendarEventID): boolean => {
  const events = get(eventsAtom);
  const drafts = get(draftsAtom);

  const event = events[eventId];
  if (!event) return false;

  const draft = drafts[eventId];
  const attendees = draft?.attendees || event.attendees;

  return attendees.some((a) => !a.isOrganizer);
});

/** Get event status */
export const getEventStatusAtom = atom((get) => (eventId: CalendarEventID): CalendarEventStatus => {
  return get(eventStatusAtom)[eventId] || 'synced';
});

/** Check if event should auto-apply changes (no attendees) */
export const shouldAutoApplyAtom = atom((get) => (eventId: CalendarEventID): boolean => {
  const hasAttendees = get(hasAttendeesAtom)(eventId);
  return !hasAttendees;
});

// ============================================================================
// SMART DRAFT CREATION (with auto-apply logic)
// ============================================================================

/** Create draft with auto-apply for events without attendees */
export const smartCreateDraftAtom = atom(
  null,
  async (
    get,
    set,
    {
      eventId,
      changes,
      source = 'user',
      userAccounts = []
    }: {
      eventId: CalendarEventID;
      changes: Partial<CalendarEventDraft>;
      source?: CalendarEventDraft['source'];
      userAccounts?: Array<{ uid: string; email: string }>;
    }
  ) => {
    // Verify event exists and has accountUid
    const events = get(eventsAtom);
    const event = events[eventId];

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    if (!event.accountUid) {
      throw new Error(`Event ${eventId} missing accountUid`);
    }

    // Always create draft first
    set(createDraftAtom, { eventId, changes, source });

    // For drag operations on events without attendees, auto-apply
    const hasAttendees = get(hasAttendeesAtom)(eventId);
    if (!hasAttendees && source === 'drag') {
      try {
        await set(applyDraftAtom, { eventId, sendNotifications: false, userAccounts });
      } catch (error) {
        // If auto-apply fails, keep as draft for manual retry
        console.error('Auto-apply failed:', error);
      }
    }
  }
);
