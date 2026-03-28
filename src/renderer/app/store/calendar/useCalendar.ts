import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import {
  // Core state
  todayAtom,
  selectedDateAtom,
  currentMonthAtom,
  viewModeAtom,
  selectedAccountUidsAtom,
  selectedTimeZoneAtom,

  // Event state
  eventsAtom,
  draftsAtom,
  eventStatusAtom,
  activeEventAtom,

  // Storage atoms
  loadEventsFromStorageAtom,
  loadDraftsFromStorageAtom,

  // Derived state
  getMergedEventAtom,
  mergedEventsAtom,
  dayEventsAtom,

  // Types
  type CalendarEvent,
  type CalendarEventID,
  type CalendarEventDraft,
  type CalendarEventStatus,
  type CalendarViewMode,
  type CalendarAccountUID,

  // Utilities
  convertFromGoogleEvent,
  getMonthKey,
  getMonthsToPreload
} from './calendarAtoms';

// Re-export for backward compatibility during transition
export type Event = CalendarEvent;
export type EventID = CalendarEventID;
export type EventDraft = CalendarEventDraft;
export type EventStatus = CalendarEventStatus;
export type ViewMode = CalendarViewMode;
export type AccountUID = CalendarAccountUID;

import {
  // Actions
  loadEventsAtom,
  discardDraftAtom,
  applyDraftAtom,
  createEventAtom,
  deleteEventAtom,
  clearEventsAtom,
  smartCreateDraftAtom,

  // Helpers
  hasAttendeesAtom,
  getEventStatusAtom,
  shouldAutoApplyAtom
} from './calendarActions';

import type { GoogleCalendarEvent } from '@/main/api/calendar/types';

/**
 * Clean calendar hook with single source of truth
 */
export function useCalendar() {
  // ============================================================================
  // CORE STATE
  // ============================================================================

  const [today] = useAtom(todayAtom);
  const [selectedDate, setSelectedDate] = useAtom(selectedDateAtom);
  const [currentMonth, setCurrentMonth] = useAtom(currentMonthAtom);
  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const [selectedAccountUids, setSelectedAccountUids] = useAtom(selectedAccountUidsAtom);
  const [selectedTimeZone, setSelectedTimeZone] = useAtom(selectedTimeZoneAtom);

  // ============================================================================
  // EVENT STATE
  // ============================================================================

  const [events] = useAtom(eventsAtom);
  const [drafts] = useAtom(draftsAtom);
  const [eventStatus] = useAtom(eventStatusAtom);
  const [activeEventId, setActiveEventId] = useAtom(activeEventAtom);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const [getMergedEvent] = useAtom(getMergedEventAtom);
  const [mergedEvents] = useAtom(mergedEventsAtom);
  const [dayEvents] = useAtom(dayEventsAtom);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const [, loadEvents] = useAtom(loadEventsAtom);
  const [, loadEventsFromStorage] = useAtom(loadEventsFromStorageAtom);
  const [, loadDraftsFromStorage] = useAtom(loadDraftsFromStorageAtom);

  const [, discardDraft] = useAtom(discardDraftAtom);
  const [, applyDraft] = useAtom(applyDraftAtom);
  const [, createEvent] = useAtom(createEventAtom);
  const [, deleteEvent] = useAtom(deleteEventAtom);
  const [, clearEvents] = useAtom(clearEventsAtom);
  const [, smartCreateDraft] = useAtom(smartCreateDraftAtom);

  // ============================================================================
  // HELPERS
  // ============================================================================

  const [hasAttendees] = useAtom(hasAttendeesAtom);
  const [getEventStatus] = useAtom(getEventStatusAtom);
  const [shouldAutoApply] = useAtom(shouldAutoApplyAtom);

  // ============================================================================
  // STORAGE INITIALIZATION
  // ============================================================================

  // Load data from storage on mount
  useEffect(() => {
    const loadFromStorage = async () => {
      try {
        await loadEventsFromStorage();
        await loadDraftsFromStorage();
      } catch (error) {
        console.error('Failed to load calendar data from storage:', error);
      }
    };

    loadFromStorage();
  }, [loadEventsFromStorage, loadDraftsFromStorage]);

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /** Load events from Google Calendar API response */
  const loadGoogleEvents = useCallback(
    (googleEvents: GoogleCalendarEvent[], accountUid: CalendarAccountUID) => {
      const events = googleEvents.map((ge) => convertFromGoogleEvent(ge, accountUid));
      loadEvents(events);
    },
    [loadEvents]
  );

  /** Get draft changes for an event */
  const getEventDraftChanges = useCallback(
    (eventId: CalendarEventID): CalendarEventDraft | undefined => {
      return drafts[eventId];
    },
    [drafts]
  );

  /** Get merged event by ID */
  const getEvent = useCallback((eventId: CalendarEventID): CalendarEvent | null => {
    return getMergedEvent(eventId);
  }, []);

  /** Get base event without draft changes */
  const getBaseEvent = useCallback(
    (eventId: CalendarEventID): CalendarEvent | null => {
      return events[eventId] || null;
    },
    [events]
  );

  /** Get active event */
  const getActiveEvent = useCallback((): CalendarEvent | null => {
    if (!activeEventId) return null;

    const event = events[activeEventId];
    if (!event) return null;

    const draft = drafts[activeEventId];
    if (!draft) return event;

    return {
      ...event,
      ...draft,
      id: activeEventId,
      updated: new Date(draft.updatedAt),
      allDay: draft.allDay !== undefined ? draft.allDay : event.allDay
    } as CalendarEvent;
  }, [activeEventId, events, drafts]);

  /** Set active event */
  const setActiveEvent = useCallback(
    (event: CalendarEvent | null) => {
      setActiveEventId(event?.id || null);
    },
    [setActiveEventId]
  );

  /** Update event field (creates draft) */
  const updateEventField = useCallback(
    (
      eventId: CalendarEventID,
      field: keyof CalendarEventDraft,
      value: unknown,
      source: CalendarEventDraft['source'] = 'user'
    ) => {
      smartCreateDraft({
        eventId,
        changes: { [field]: value },
        source
      });
    },
    [smartCreateDraft]
  );

  /** Update multiple event fields at once */
  const updateEventFields = useCallback(
    (
      eventId: CalendarEventID,
      changes: Partial<CalendarEventDraft>,
      source: CalendarEventDraft['source'] = 'user',
      userAccounts?: Array<{ uid: string; email: string }>
    ) => {
      smartCreateDraft({
        eventId,
        changes,
        source,
        userAccounts
      });
    },
    [smartCreateDraft]
  );

  /** Move event (drag operation) */
  const moveEvent = useCallback(
    (eventId: CalendarEventID, newStart: Date, newEnd: Date) => {
      updateEventFields(
        eventId,
        {
          start: {
            dateTime: newStart.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          end: {
            dateTime: newEnd.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        },
        'drag'
      );
    },
    [updateEventFields]
  );

  /** Check if event has unsaved changes */
  const hasUnsavedChanges = useCallback(
    (eventId: CalendarEventID): boolean => {
      const status = getEventStatus(eventId);
      return status === 'draft' || status === 'error';
    },
    [getEventStatus]
  );

  /** Check if event is being saved */
  const isSaving = useCallback(
    (eventId: CalendarEventID): boolean => {
      const status = getEventStatus(eventId);
      return status === 'saving' || status === 'deleting';
    },
    [getEventStatus]
  );

  /** Save event changes */
  const saveEvent = useCallback(
    async (
      eventId: CalendarEventID,
      sendNotifications = true,
      userAccounts?: Array<{ uid: string; email: string }>
    ): Promise<void> => {
      await applyDraft({ eventId, sendNotifications, userAccounts });
    },
    [applyDraft]
  );

  /** Discard event changes */
  const discardEventChanges = useCallback(
    (eventId: CalendarEventID) => {
      discardDraft(eventId);
    },
    [discardDraft]
  );

  /** Delete event */
  const removeEvent = useCallback(
    async (eventId: CalendarEventID, sendNotifications = true): Promise<void> => {
      await deleteEvent({ eventId, sendNotifications });
    },
    [deleteEvent]
  );

  /** Create new event */
  const addEvent = useCallback(
    async (
      eventData: Omit<CalendarEvent, 'id' | 'etag' | 'sequence' | 'created' | 'updated'>,
      userAccounts?: Array<{ uid: string; email: string }>
    ): Promise<string> => {
      return await createEvent({ eventData, userAccounts });
    },
    [createEvent]
  );

  /** Clear events for account switching */
  const clearAccountEvents = useCallback(
    (accountUids?: string[]) => {
      clearEvents(accountUids);
    },
    [clearEvents]
  );

  /** Get month cache key */
  const getMonthCacheKey = useCallback((date: Date, accountUid: AccountUID) => {
    return getMonthKey(date, accountUid);
  }, []);

  /** Get months that should be preloaded */
  const getPreloadMonths = useCallback((currentMonth: Date) => {
    return getMonthsToPreload(currentMonth);
  }, []);

  /** Set selected timezone with automatic layout rerender */
  const setSelectedTimeZoneWithRerender = useCallback(
    (timeZone: string) => {
      setSelectedTimeZone(timeZone);
    },
    [setSelectedTimeZone]
  );

  // ============================================================================
  // RETURN INTERFACE
  // ============================================================================

  return {
    // Core state
    today,
    selectedDate,
    setSelectedDate,
    currentMonth,
    setCurrentMonth,
    viewMode,
    setViewMode,
    selectedAccountUids,
    setSelectedAccountUids,
    selectedTimeZone,
    setSelectedTimeZone: setSelectedTimeZoneWithRerender,

    // Event state
    events,
    drafts,
    eventStatus,
    mergedEvents,
    dayEvents,

    // Active event
    activeEventId,
    getActiveEvent,
    setActiveEvent,

    // Event operations
    getEvent,
    getBaseEvent,
    loadGoogleEvents,
    addEvent,
    removeEvent,
    updateEventField,
    updateEventFields,
    moveEvent,
    saveEvent,
    discardEventChanges,

    // Status checks
    hasUnsavedChanges,
    isSaving,
    hasAttendees,
    shouldAutoApply,
    getEventStatus,

    // Utilities
    clearAccountEvents,
    getMonthCacheKey,
    getPreloadMonths,
    getEventDraftChanges
  } as const;
}
