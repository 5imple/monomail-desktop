import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { addMonths, format, subMonths } from 'date-fns';
import type { GoogleCalendarEvent } from '@/main/api/calendar/types';
import {
  eventSpansDay,
  parseEventDate,
  isAllDayFromApiResponse
} from '@/renderer/app/containers/panel/calendar/utils';
import { UserPreference } from '@/main/api/auth/types';

// Clean types for the new architecture
export type CalendarEventID = string;
export type CalendarAccountUID = string;

// Single unified event type (no more dual types)
export interface CalendarEvent {
  // Core properties
  id: CalendarEventID;
  accountUid: CalendarAccountUID;

  // Content
  title: string;
  summary?: string; // For compatibility with GoogleCalendarEvent
  description?: string;
  location?: string;

  // Time & recurrence
  start: {
    dateTime: string | null;
    date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null; // For all-day events
    timeZone?: string | null;
  };
  end: {
    dateTime: string | null;
    date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null; // For all-day events
    timeZone?: string | null;
  };
  timezone: string; // IANA timezone
  allDay: boolean;
  recurrence?: {
    rrule: string;
    exdates?: string[];
  };

  // Attendees
  attendees: Array<{
    email: string;
    name?: string;
    response: 'accepted' | 'tentative' | 'declined' | 'needsAction';
    isOrganizer: boolean;
  }>;

  // Metadata (from server)
  etag: string;
  htmlLink?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  sequence: number;
  created: Date;
  updated: Date;

  // Conference
  conferenceData?: {
    conferenceId: string;
    entryPoints: Array<{
      entryPointType: string;
      uri: string;
      label?: string;
    }>;
  };
}

// Draft changes (sparse updates)
export interface CalendarEventDraft {
  // Only include fields that can be modified
  title?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string | null;
    date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null; // For all-day events
    timeZone?: string | null;
  };
  end?: {
    dateTime?: string | null;
    date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null; // For all-day events
    timeZone?: string | null;
  };
  timezone?: string;
  allDay?: boolean;
  attendees?: CalendarEvent['attendees'];

  // Track attendee changes separately for proper draft behavior
  removedAttendeeEmails?: string[]; // Original attendees that were removed (should be strikethrough)
  addedAttendees?: CalendarEvent['attendees']; // Newly added attendees (should be removed immediately)

  // Metadata
  updatedAt: number;
  source: 'user' | 'drag' | 'resize';
}

// Event status for optimistic updates
export type CalendarEventStatus =
  | 'synced' // In sync with server
  | 'draft' // Has unsaved changes
  | 'saving' // Currently being saved
  | 'error' // Save failed
  | 'deleting' // Being deleted
  | 'deleted'; // Successfully deleted

// View configuration
export type CalendarViewMode = 'DAY' | 'AGENDA';
export type CalendarView = 'month' | 'week' | 'day';

// Drag interaction types
export type CalendarDragHandle = 'start' | 'end' | 'move';

export interface CalendarDragSelection {
  startDate: Date;
  endDate: Date;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
}

// Calendar view component props
export interface CalendarViewProps {
  events: CalendarEvent[];
  activeEvent: CalendarEvent | null;
  // New draft system
  getEventDraftStatus?: (eventId: string) => 'none' | 'draft' | 'applying' | 'error';
  onEventClick: (event: CalendarEvent, target?: HTMLElement) => void;
  onCreateEvent: (
    date: Date,
    hour?: number,
    minute?: number,
    anchor?:
      | { clientX: number; clientY: number }
      | { rect: { left: number; top: number; width: number; height: number } },
    endDate?: Date
  ) => void;
  onDragSelectionStart: (
    date: Date,
    hour?: number,
    minute?: number,
    slotId?: string,
    mouseX?: number,
    mouseY?: number
  ) => void;
  onDragSelectionChange?: (date: Date, hour?: number, minute?: number, slotId?: string) => void;
  onDragSelectionEnd?: (date: Date, hour?: number, minute?: number, slotId?: string) => void;
  onEventDragEnd?: (event: CalendarEvent, newStart: Date, newEnd: Date) => void;
  onEventUpdate?: (event: CalendarEvent) => void;
  onClearSelection: () => void;
  isDragSelecting: boolean;
  dragSelection: CalendarDragSelection | null;
  pendingCreate?: { start: Date; end: Date } | null;
  onPendingCreateRendered?: (el: HTMLElement, start: Date, end: Date) => void;
  clearPendingCreate?: () => void;
  selectedTimeZone: string;
  setSelectedTimeZone: (timeZone: string) => void;
  userTimeZone: string;
  preference: UserPreference; // Will use UserPreference from auth types
  selectedAccountUids: string[];
}

// ============================================================================
// ATOMS - Single Source of Truth
// ============================================================================

// Core app state
export const todayAtom = atom<Date>(new Date());
export const selectedDateAtom = atom<Date>(new Date());
export const currentMonthAtom = atom<Date>(new Date());

// Storage atoms for persistence (only for atoms not used in derived atoms)
export const viewModeAtom = atomWithStorage<CalendarViewMode>(
  'calendar:viewMode',
  'DAY',
  createIndexedDBStorage<CalendarViewMode>({
    defaultValue: 'DAY'
  })
);

// Account selection
export const selectedAccountUidsAtom = atom<CalendarAccountUID[]>([]);

// Time zone
const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const selectedTimeZoneAtom = atom<string>(defaultTimeZone);

// ============================================================================
// EVENT STATE - Single Source of Truth
// ============================================================================

/** Server state: canonical events from API */
export const eventsAtom = atom<Record<CalendarEventID, CalendarEvent>>({});

/** Draft state: unsaved changes per event */
export const draftsAtom = atom<Record<CalendarEventID, CalendarEventDraft>>({});

/** Status tracking for optimistic updates */
export const eventStatusAtom = atom<Record<CalendarEventID, CalendarEventStatus>>({});

/** Active/selected event */
export const activeEventAtom = atom<CalendarEventID | null>(null);

// ============================================================================
// STORAGE ATOMS - For persistence of events and drafts
// ============================================================================

/** Storage atom for events */
export const eventsStorageAtom = atomWithStorage<Record<CalendarEventID, CalendarEvent>>(
  'calendar:events',
  {},
  createIndexedDBStorage<Record<CalendarEventID, CalendarEvent>>({
    defaultValue: {}
  })
);

/** Storage atom for drafts */
export const draftsStorageAtom = atomWithStorage<Record<CalendarEventID, CalendarEventDraft>>(
  'calendar:drafts',
  {},
  createIndexedDBStorage<Record<CalendarEventID, CalendarEventDraft>>({
    defaultValue: {}
  })
);

// ============================================================================
// SYNC ATOMS - Keep storage in sync with main atoms
// ============================================================================

/** Sync events to storage */
export const syncEventsToStorageAtom = atom(
  null,
  (get, set, events: Record<CalendarEventID, CalendarEvent>) => {
    set(eventsStorageAtom, events);
  }
);

/** Sync drafts to storage */
export const syncDraftsToStorageAtom = atom(
  null,
  (get, set, drafts: Record<CalendarEventID, CalendarEventDraft>) => {
    set(draftsStorageAtom, drafts);
  }
);

/** Load events from storage */
export const loadEventsFromStorageAtom = atom(null, async (get, set) => {
  const storedEvents = await get(eventsStorageAtom);
  set(eventsAtom, storedEvents);
});

/** Load drafts from storage */
export const loadDraftsFromStorageAtom = atom(null, async (get, set) => {
  const storedDrafts = await get(draftsStorageAtom);
  set(draftsAtom, storedDrafts);
});

// ============================================================================
// DERIVED STATE
// ============================================================================

/** All merged events for rendering */
export const mergedEventsAtom = atom((get) => {
  const events = get(eventsAtom);
  const drafts = get(draftsAtom);

  return Object.keys(events)
    .map((eventId) => {
      const event = events[eventId];
      if (!event) return null;

      const draft = drafts[eventId];
      if (!draft) return event;

      // Create a properly typed CalendarEvent object
      const merged: CalendarEvent = {
        ...event,
        ...draft,
        id: eventId, // Ensure ID consistency
        updated: new Date(draft.updatedAt),
        // Ensure allDay property is properly set from draft if it exists
        allDay: draft.allDay !== undefined ? draft.allDay : event.allDay,
        // Properly merge start and end objects
        start: {
          dateTime: draft.start?.dateTime ?? event.start.dateTime,
          date: draft.start?.date ?? event.start.date ?? null,
          timeZone: draft.start?.timeZone ?? event.start.timeZone
        },
        end: {
          dateTime: draft.end?.dateTime ?? event.end.dateTime,
          date: draft.end?.date ?? event.end.date ?? null,
          timeZone: draft.end?.timeZone ?? event.end.timeZone
        }
      };
      return merged;
    })
    .filter((event): event is CalendarEvent => event !== null);
});

/** Get merged event (server + draft) - for backward compatibility */
export const getMergedEventAtom = atom(
  (get) =>
    (eventId: CalendarEventID): CalendarEvent | null => {
      const mergedEvents = get(mergedEventsAtom);
      return mergedEvents.find((event) => event.id === eventId) || null;
    }
);

/** Events filtered for the selected date */
export const dayEventsAtom = atom((get) => {
  const selectedDate = get(selectedDateAtom);
  const selectedTimeZone = get(selectedTimeZoneAtom);
  const selectedAccountUids = get(selectedAccountUidsAtom);
  const mergedEvents = get(mergedEventsAtom);
  const eventStatus = get(eventStatusAtom);

  if (selectedAccountUids.length === 0) return [];

  const filteredEvents = mergedEvents.filter((event) => {
    // Filter by account
    if (!selectedAccountUids.includes(event.accountUid)) return false;

    // Filter by status (exclude deleted)
    const status = eventStatus[event.id];
    if (status === 'deleted') return false;

    return eventSpansDay(event, selectedDate, selectedTimeZone);
  });

  return filteredEvents.sort((a, b) => {
    const aStart = parseEventDate(a.allDay ? a.start.date : a.start.dateTime) || new Date();
    const bStart = parseEventDate(b.allDay ? b.start.date : b.start.dateTime) || new Date();
    return aStart.getTime() - bStart.getTime();
  });
});

// ============================================================================
// UTILITIES
// ============================================================================

/** Convert GoogleCalendarEvent to our CalendarEvent type */
export function convertFromGoogleEvent(
  googleEvent: GoogleCalendarEvent,
  accountUid: CalendarAccountUID
): CalendarEvent {
  const organizer = googleEvent.organizer?.email;

  // Helper to extract date/time from DateTimeInfo and convert to dateTime format
  const getDateTimeValue = (dateTimeInfo: unknown): string | null => {
    const dtInfo = dateTimeInfo as { dateTime?: string; date?: string | { value: number } };
    if (dtInfo?.dateTime) {
      return dtInfo.dateTime;
    }
    if (dtInfo?.date) {
      if (typeof dtInfo.date === 'string') {
        // Convert date string to full dateTime (start of day)
        return new Date(dtInfo.date + 'T00:00:00').toISOString();
      }
      if (typeof dtInfo.date === 'object' && 'value' in dtInfo.date) {
        return new Date(dtInfo.date.value).toISOString();
      }
    }
    return null;
  };

  // Helper to extract date from DateTimeInfo for all-day events
  const getDateValue = (dateTimeInfo: unknown): string | null => {
    const dtInfo = dateTimeInfo as { date?: string | { value: number } };
    if (dtInfo?.date) {
      if (typeof dtInfo.date === 'string') {
        return dtInfo.date;
      }
      if (typeof dtInfo.date === 'object' && 'value' in dtInfo.date) {
        return new Date(dtInfo.date.value).toISOString().split('T')[0];
      }
    }
    return null;
  };

  const convertedEvent = {
    id: googleEvent.id,
    accountUid, // Ensure accountUid is always set
    title: googleEvent.summary || '',
    summary: googleEvent.summary || '',
    description: googleEvent.description,
    location: googleEvent.location,
    start: {
      dateTime: getDateTimeValue(googleEvent.start),
      date: getDateValue(googleEvent.start),
      timeZone: googleEvent.start?.timeZone
    },
    end: {
      dateTime: getDateTimeValue(googleEvent.end),
      date: getDateValue(googleEvent.end),
      timeZone: googleEvent.end?.timeZone
    },
    timezone: googleEvent.start?.timeZone || defaultTimeZone,
    allDay: isAllDayFromApiResponse(googleEvent.start, googleEvent.end),
    attendees: (googleEvent.attendees || []).map((attendee) => ({
      email: attendee.email,
      name: attendee.email, // Google Calendar Attendee doesn't have displayName, use email as name
      response:
        (attendee.responseStatus as 'accepted' | 'tentative' | 'declined' | 'needsAction') ||
        'needsAction',
      isOrganizer: attendee.organizer || attendee.email === organizer
    })),
    etag: googleEvent.etag || '',
    htmlLink: googleEvent.htmlLink,
    status: (googleEvent.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
    sequence: googleEvent.sequence || 0,
    created: new Date(googleEvent.created?.value || Date.now()),
    updated: new Date(googleEvent.updated?.value || Date.now()),
    conferenceData: googleEvent.conferenceData
      ? {
          conferenceId: googleEvent.conferenceData.conferenceId || '',
          entryPoints: googleEvent.conferenceData.entryPoints || []
        }
      : undefined
  };

  return convertedEvent;
}
/** Helper to get month cache key */
export const getMonthKey = (date: Date, accountUid: CalendarAccountUID): string => {
  return `${accountUid}:${format(date, 'yyyy-MM')}`;
};

/** Get months to preload (prev, current, next) */
export const getMonthsToPreload = (currentMonth: Date): Date[] => {
  return [subMonths(currentMonth, 1), currentMonth, addMonths(currentMonth, 1)];
};
