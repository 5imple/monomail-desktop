import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { addDays } from 'date-fns';

import calendarApi from '@/main/api/calendar/calendarApi';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import type { MonoAccount, UserPreference } from '@/main/api/auth/types';
import DateInput from '@/renderer/app/components/ui/date-input';
import { Input } from '@/renderer/app/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { Switch } from '@/renderer/app/components/ui/switch';
// Tabs components removed - not currently used in clean editor
import { Textarea } from '@/renderer/app/components/ui/textarea';
import TimeInput from '@/renderer/app/components/ui/time-input';
import ParticipantListInput from '@/renderer/app/containers/input/ParticipantListInput';
import type { Option } from '@/renderer/app/components/ui/multi-selector';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useCalendar } from '@/renderer/app/store/calendar/useCalendar';
import type {
  CalendarEventID,
  CalendarEvent,
  CalendarEventDraft
} from '@/renderer/app/store/calendar/calendarAtoms';
import { parseEventDate } from '@/renderer/app/containers/panel/calendar/utils';
import { getAccountColor } from '@/renderer/app/containers/panel/calendar/shared';
import {
  findJoinLink,
  htmlToPlainText,
  looksLikeHtml
} from '@/renderer/app/containers/panel/calendar/eventText';
import {
  getTimezoneAbbreviation,
  getTimezoneLongName
} from '@/renderer/app/containers/panel/calendar/timezoneUtils';
import { cn } from '@/renderer/app/lib/utils';
import { toast } from 'sonner';

// Helper functions for proper all-day date handling
const formatDateForGoogleCalendar = (date: Date): string => {
  // Format as YYYY-MM-DD for Google Calendar all-day events
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDayForGoogleCalendar = (date: Date): Date => {
  // Google Calendar all-day events have exclusive end dates, so add 1 day
  return addDays(date, 1);
};

type RsvpResponse = 'accepted' | 'tentative' | 'declined';
const RSVP_OPTIONS: Array<{ value: RsvpResponse; label: string; done: string }> = [
  { value: 'accepted', label: 'Yes', done: 'Accepted' },
  { value: 'tentative', label: 'Maybe', done: 'Tentatively accepted' },
  { value: 'declined', label: 'No', done: 'Declined' }
];

type EditorMode = 'create' | 'edit';

export interface CalendarEventEditorProps {
  mode: EditorMode;
  accounts: MonoAccount[];
  eventId?: CalendarEventID;
  defaultValues?: {
    title?: string;
    start: Date;
    end: Date;
    location?: string;
    description?: string;
    allDay?: boolean;
  };
  onClose: () => void;
  onEventCreated?: (eventId: CalendarEventID) => void;
  onEventUpdated?: (eventId: CalendarEventID) => void;
  onEventDeleted?: (eventId: CalendarEventID) => void;
  initialAccountUid?: string;
  // For the account colors in the account picker. Passed in: the editor
  // renders in its own React root, outside the app's providers.
  preference?: UserPreference;
}

/**
 * Clean EventEditor using the new single-source-of-truth architecture
 *
 * Key improvements:
 * 1. Single state source - no dual MonoEvent/EventProps conversion
 * 2. Reactive updates - UI automatically reflects draft changes
 * 3. Smart auto-apply - events without attendees auto-save on drag
 * 4. Proper separation - UI state separate from server state
 * 5. Clean rollback - easy to discard changes
 */
const CalendarEventEditor: React.FC<CalendarEventEditorProps> = ({
  mode,
  accounts,
  eventId,
  defaultValues,
  onClose,
  onEventCreated,
  onEventUpdated,
  onEventDeleted,
  initialAccountUid,
  preference
}) => {
  const { contactArray } = useContactAtom();
  const {
    getEvent,
    getBaseEvent,
    updateEventField,
    updateEventFields,
    saveEvent,
    discardEventChanges,
    addEvent,
    removeEvent,
    hasUnsavedChanges,
    isSaving,
    hasAttendees,
    getEventStatus,
    drafts
  } = useCalendar();

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  // Get the event being edited (if any)
  const event = eventId ? getEvent(eventId) : null;
  const status = eventId ? getEventStatus(eventId) : 'synced';
  const eventHasAttendees = eventId ? hasAttendees(eventId) : false;
  const isLoading = eventId ? isSaving(eventId) : false;
  const draft = eventId ? drafts[eventId] : undefined;
  // Drafts restored after a restart have no 'draft' status, so check both.
  const hasChanges = mode === 'edit' && !!eventId && (!!draft || hasUnsavedChanges(eventId));

  // Local UI state (for creation and temporary edits)
  const [localTitle, setLocalTitle] = useState(defaultValues?.title || '');
  const [localStart, setLocalStart] = useState(defaultValues?.start || new Date());
  const [localEnd, setLocalEnd] = useState(defaultValues?.end || new Date(Date.now() + 3600000));
  const [localDescription, setLocalDescription] = useState(defaultValues?.description || '');
  const [localLocation, setLocalLocation] = useState(defaultValues?.location || '');
  const [localAllDay, setLocalAllDay] = useState(defaultValues?.allDay || false);
  const [localTimeZone, setLocalTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [localAttendees, setLocalAttendees] = useState<Option[]>([]);
  const [selectedAccountUid, setSelectedAccountUid] = useState(
    initialAccountUid || accounts[0]?.uid || ''
  );

  // An invitation from someone else: you answer it, and edits only change
  // your own copy, so nothing is "sent" to anyone.
  const eventAccount = accounts.find((a) => a.uid === event?.accountUid);
  const selfEmail = eventAccount?.email?.toLowerCase();
  const selfAttendee =
    mode === 'edit' && selfEmail
      ? event?.attendees.find((a) => !a.isOrganizer && a.email?.toLowerCase() === selfEmail)
      : undefined;
  const isInvitee = !!selfAttendee;
  const [rsvp, setRsvp] = useState<RsvpResponse | null>(() => {
    // Outlook's attendee list doesn't reliably carry your own reply, so there
    // a choice only shows once you make one here.
    const response = selfAttendee?.response;
    return eventAccount?.provider === 'google' &&
      (response === 'accepted' || response === 'tentative' || response === 'declined')
      ? response
      : null;
  });
  const [rsvpSending, setRsvpSending] = useState(false);

  // Save / delete progress. Refs as well as state: two clicks in the same
  // frame both saw `false` and created the event twice.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [holdConfirm, setHoldConfirm] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const confirmRowRef = useRef<HTMLDivElement>(null);
  const accountSelectId = React.useId();

  // Focus moves into the editor when it opens: the title for a new event, the
  // editor itself for an existing one (so nothing is selected or typed over).
  // It used to stay behind, unreachable by Tab, with keys going to the inbox.
  useEffect(() => {
    const target = mode === 'create' ? titleRef.current : rootRef.current;
    const frame = requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // ============================================================================
  // REACTIVE STATE SYNC
  // ============================================================================

  // Sync UI state with event state (for edit mode)
  useEffect(() => {
    if (mode === 'edit' && event && eventId) {
      setLocalTitle(event.title);

      // Handle all-day events specially to prevent timezone shifts
      let startDate: Date;
      let endDate: Date;

      if (event.allDay && event.start.date && event.end.date) {
        // For all-day events, use the fixed parseEventDate function
        startDate = parseEventDate(event.start.date) || new Date();
        endDate = parseEventDate(event.end.date) || new Date();

        // For all-day events, Google Calendar end date is exclusive, so subtract 1 day
        // and set to end of day
        if (endDate) {
          endDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // subtract 1 day
          endDate = new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate(),
            23,
            59,
            59,
            999
          );
        }
      } else {
        // For timed events, use normal parsing
        startDate = parseEventDate(event.start.dateTime) || new Date();
        endDate = parseEventDate(event.end.dateTime) || new Date();
      }

      setLocalStart(startDate);
      setLocalEnd(endDate);
      setLocalDescription(event.description || '');
      setLocalLocation(event.location || '');
      setLocalAllDay(event.allDay);
      setLocalTimeZone(event.timezone);
      setSelectedAccountUid(event.accountUid);

      // Convert attendees to Options
      const attendeeOptions: Option[] = event.attendees
        .filter((a) => !a.isOrganizer)
        .map((a) => ({
          value: a.email,
          label: a.name || a.email,
          responseStatus: a.response
        }));
      setLocalAttendees(attendeeOptions);

      // Store original attendees for draft comparison using the base event (not current event with draft changes)
      const baseEvent = getBaseEvent(eventId);
      if (baseEvent) {
        const originalAttendeeOptions: Option[] = baseEvent.attendees
          .filter((a) => !a.isOrganizer)
          .map((a) => ({
            value: a.email,
            label: a.name || a.email,
            responseStatus: a.response
          }));
        setOriginalAttendees(originalAttendeeOptions);
      }
    }
  }, [mode, eventId]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  // Update handlers that immediately persist to draft (for edit mode)
  const handleTitleChange = useCallback(
    (value: string) => {
      setLocalTitle(value);
      if (eventId) {
        updateEventField(eventId, 'title', value);
      }
    },
    [eventId, updateEventField, event?.title]
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setLocalDescription(value);
      if (eventId) {
        updateEventField(eventId, 'description', value);
      }
    },
    [eventId, updateEventField]
  );

  const handleLocationChange = useCallback(
    (value: string) => {
      setLocalLocation(value);
      if (eventId) {
        updateEventField(eventId, 'location', value);
      }
    },
    [eventId, updateEventField]
  );

  const handleTimeChange = useCallback(
    (field: 'start' | 'end', date: Date) => {
      const startFields = (start: Date) => ({
        dateTime: localAllDay ? null : start.toISOString(),
        date: localAllDay ? formatDateForGoogleCalendar(start) : null,
        timeZone: localTimeZone
      });
      const endFields = (end: Date) => ({
        dateTime: localAllDay ? null : end.toISOString(),
        date: localAllDay ? formatDateForGoogleCalendar(addDayForGoogleCalendar(end)) : null,
        timeZone: localTimeZone
      });
      if (field === 'start') {
        // A new start keeps the duration: the end moves with it (it used to
        // stay put, shrinking the event, or snap to a flat hour).
        const duration =
          localEnd.getTime() > localStart.getTime()
            ? localEnd.getTime() - localStart.getTime()
            : 3600000;
        const newEnd = new Date(date.getTime() + duration);
        setLocalStart(date);
        setLocalEnd(newEnd);
        if (eventId) {
          updateEventFields(eventId, { start: startFields(date), end: endFields(newEnd) });
        }
      } else {
        // An end at or before the start stays here, with an inline error,
        // until it's valid. Snapping it an hour past the start mid-typing
        // turned "3:30" into 4:30.
        setLocalEnd(date);
        if (eventId && date.getTime() > localStart.getTime()) {
          updateEventField(eventId, 'end', endFields(date));
        }
      }
    },
    [eventId, localStart, localEnd, localAllDay, localTimeZone, updateEventField, updateEventFields]
  );

  const handleAllDayChange = useCallback(
    (allDay: boolean) => {
      // Prevent double execution if state hasn't changed
      if (allDay === localAllDay) {
        return;
      }

      let newStart = localStart;
      let newEnd = localEnd;
      let newTimeZone = localTimeZone;

      if (allDay) {
        // For all-day conversion, preserve the date by using local date components
        // This prevents timezone shifts when converting to/from all-day
        newStart = new Date(localStart.getFullYear(), localStart.getMonth(), localStart.getDate());

        // For all-day events in the editor, we keep the end date inclusive (same day as displayed)
        // But when saving, Google Calendar expects exclusive end date (next day)
        newEnd = new Date(
          localEnd.getFullYear(),
          localEnd.getMonth(),
          localEnd.getDate(),
          23,
          59,
          59,
          999
        );
      } else {
        // When untoggling all-day, convert to a single-day timed event
        // Always use the start date to ensure we don't create multi-day events
        const startYear = localStart.getFullYear();
        const startMonth = localStart.getMonth();
        const startDate = localStart.getDate();

        // Set start time to 12:00 PM on the start date
        newStart = new Date(startYear, startMonth, startDate, 12, 0, 0, 0);

        // Set end time to 1:00 PM on the same date (1-hour duration)
        // Always use the start date, not localEnd (which might be adjusted for all-day format)
        newEnd = new Date(startYear, startMonth, startDate, 13, 0, 0, 0);

        // Set timezone to current user's timezone
        newTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }

      // Update local state
      setLocalAllDay(allDay);
      setLocalStart(newStart);
      setLocalEnd(newEnd);
      if (!allDay) {
        setLocalTimeZone(newTimeZone);
      }
      if (eventId) {
        const updateFields: Partial<CalendarEventDraft> = {
          allDay,
          start: {
            dateTime: allDay ? null : newStart.toISOString(),
            date: allDay ? formatDateForGoogleCalendar(newStart) : null,
            timeZone: allDay ? null : newTimeZone
          },
          end: {
            dateTime: allDay ? null : newEnd.toISOString(),
            // For Google Calendar, all-day events need exclusive end date (add 1 day)
            // For timed events, use the actual end date
            date: allDay ? formatDateForGoogleCalendar(addDayForGoogleCalendar(newEnd)) : null,
            timeZone: allDay ? null : newTimeZone
          }
        };

        // Only include timezone when switching from all-day to timed event
        if (!allDay) {
          updateFields.timezone = newTimeZone;
        }

        updateEventFields(eventId, updateFields);
      }
    },
    [eventId, localStart, localEnd, localTimeZone, updateEventFields, getEvent]
  );

  // Track original attendees for draft comparison
  const [originalAttendees, setOriginalAttendees] = useState<Option[]>([]);

  const handleAttendeesChange = useCallback(
    (attendees: Option[]) => {
      setLocalAttendees(attendees);
      if (eventId) {
        // Check if any previously removed attendees are being re-added
        const currentDraft = drafts[eventId];
        const currentRemovedEmails = currentDraft?.removedAttendeeEmails || [];
        const attendeeEmails = attendees.map((a) => a.value);
        const previousAttendeeEmails = localAttendees.map((a) => a.value);

        // Check for newly added attendees by comparing what was added vs what was there before
        const newlyAddedEmails = attendeeEmails.filter(
          (email) => !previousAttendeeEmails.includes(email)
        );

        // Only handle truly new attendees here - re-addition is handled by handleReAddAttendee
        // This prevents clearing the removed list when just adding new attendees
        const stillRemovedEmails = currentRemovedEmails.filter(
          (email) => !newlyAddedEmails.includes(email)
        );

        // Update the removedAttendeeEmails list only if any newly added attendees were in the removed list
        if (stillRemovedEmails.length !== currentRemovedEmails.length) {
          updateEventField(eventId, 'removedAttendeeEmails', stillRemovedEmails);
        }

        const attendeeData = attendees.map((a) => ({
          email: a.value,
          name: a.label,
          response: (a as Option & { responseStatus?: string }).responseStatus || 'needsAction',
          isOrganizer: false
        }));
        updateEventField(eventId, 'attendees', attendeeData);
      }
    },
    [eventId, updateEventField, drafts, localAttendees]
  );

  // Custom handler for removing attendees in draft mode
  const handleRemoveAttendee = useCallback(
    (email: string) => {
      if (!eventId) return;

      // Check if this attendee was in the original event
      const isOriginalAttendee = originalAttendees.some((a) => a.value === email);

      if (isOriginalAttendee) {
        // For original attendees, add to removedAttendeeEmails in draft
        const currentDraft = drafts[eventId];
        const currentRemovedEmails = currentDraft?.removedAttendeeEmails || [];

        if (!currentRemovedEmails.includes(email)) {
          updateEventField(eventId, 'removedAttendeeEmails', [...currentRemovedEmails, email]);
        }
      } else {
        // For newly added attendees, remove them immediately
        const newAttendees = localAttendees.filter((a) => a.value !== email);
        setLocalAttendees(newAttendees);

        const attendeeData = newAttendees.map((a) => ({
          email: a.value,
          name: a.label,
          response: (a as Option & { responseStatus?: string }).responseStatus || 'needsAction',
          isOrganizer: false
        }));
        updateEventField(eventId, 'attendees', attendeeData);
      }
    },
    [eventId, originalAttendees, drafts, localAttendees, updateEventField]
  );

  // Custom handler for re-adding removed attendees
  const handleReAddAttendee = useCallback(
    (email: string) => {
      if (!eventId) return;

      const currentDraft = drafts[eventId];
      const currentRemovedEmails = currentDraft?.removedAttendeeEmails || [];

      // Remove the email from removedAttendeeEmails
      const stillRemovedEmails = currentRemovedEmails.filter((e) => e !== email);
      updateEventField(eventId, 'removedAttendeeEmails', stillRemovedEmails);
    },
    [eventId, drafts, updateEventField]
  );

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  const timesInvalid = !localAllDay && localEnd.getTime() <= localStart.getTime();
  const titleMissing = mode === 'create' && !localTitle.trim();
  const busy = isLoading || submitting || deleting;
  // Edit mode needs something to save, not a title: an untitled event's other
  // changes must still be sendable.
  const saveDisabled = busy || timesInvalid || (mode === 'create' ? titleMissing : !hasChanges);

  const handleSave = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (mode === 'create') {
        // Create new event
        const selectedAccount = accounts.find((a) => a.uid === selectedAccountUid);
        if (!selectedAccount) {
          toast.error('Please select an account');
          return;
        }

        const newEventData: Omit<
          CalendarEvent,
          'id' | 'etag' | 'sequence' | 'created' | 'updated'
        > = {
          accountUid: selectedAccountUid,
          title: localTitle,
          description: localDescription,
          location: localLocation,
          start: {
            dateTime: localAllDay ? null : localStart.toISOString(),
            date: localAllDay ? formatDateForGoogleCalendar(localStart) : null,
            timeZone: localTimeZone
          },
          end: {
            dateTime: localAllDay ? null : localEnd.toISOString(),
            date: localAllDay
              ? formatDateForGoogleCalendar(addDayForGoogleCalendar(localEnd))
              : null,
            timeZone: localTimeZone
          },
          timezone: localTimeZone,
          allDay: localAllDay,
          attendees: [
            // Add organizer
            {
              email: selectedAccount.email || '',
              name: selectedAccount.displayName || selectedAccount.email || '',
              response: 'accepted' as const,
              isOrganizer: true
            },
            // Add other attendees
            ...localAttendees.map((a) => ({
              email: a.value,
              name: a.label,
              response:
                ((a as Option & { responseStatus?: string }).responseStatus as
                  | 'accepted'
                  | 'declined'
                  | 'tentative'
                  | 'needsAction') || 'needsAction',
              isOrganizer: false
            }))
          ],
          status: 'confirmed' as const,
          htmlLink: ''
        };

        const accountsInfo = accounts.map((acc) => ({ uid: acc.uid, email: acc.email }));
        const newEventId = await addEvent(newEventData, accountsInfo);
        toast.success(
          localAttendees.length > 0 ? 'Event created · invitations sent' : 'Event created'
        );
        onEventCreated?.(newEventId);
        onClose();
      } else if (eventId) {
        // Only a draft has anything to apply (saveEvent returns without one),
        // yet "Updates sent" used to be toasted regardless.
        if (!drafts[eventId]) {
          discardEventChanges(eventId); // clears a leftover error status
          onClose();
          return;
        }
        const accountsInfo = accounts.map((acc) => ({ uid: acc.uid, email: acc.email }));
        await saveEvent(eventId, eventHasAttendees, accountsInfo);
        // An invitee's edits change only their own copy; nobody is notified.
        toast.success(
          eventHasAttendees && !isInvitee ? 'Updates sent to attendees' : 'Event updated'
        );
        onEventUpdated?.(eventId);
        onClose();
      }
    } catch (error) {
      console.error('Failed to save event:', error);
      toast.error(mode === 'create' ? "Couldn't create the event" : "Couldn't save the event");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    mode,
    eventId,
    accounts,
    selectedAccountUid,
    localTitle,
    localDescription,
    localLocation,
    localStart,
    localEnd,
    localTimeZone,
    localAllDay,
    localAttendees,
    eventHasAttendees,
    isInvitee,
    drafts,
    addEvent,
    saveEvent,
    discardEventChanges,
    onEventCreated,
    onEventUpdated,
    onClose
  ]);

  const handleDiscard = useCallback(() => {
    if (eventId) {
      const changed = !!drafts[eventId] || hasUnsavedChanges(eventId);
      // Use the base event to get clean data without draft changes
      const baseEvent = getBaseEvent(eventId);

      discardEventChanges(eventId);

      // Revert UI state to the original event values (without draft)
      if (baseEvent) {
        setLocalTitle(baseEvent.title);
        const startDate = parseEventDate(
          baseEvent.allDay ? baseEvent.start.date : baseEvent.start.dateTime
        );
        const endDate = parseEventDate(
          baseEvent.allDay ? baseEvent.end.date : baseEvent.end.dateTime
        );
        setLocalStart(startDate || new Date());
        setLocalEnd(endDate || new Date());
        setLocalDescription(baseEvent.description || '');
        setLocalLocation(baseEvent.location || '');
        setLocalAllDay(baseEvent.allDay);
        setLocalTimeZone(baseEvent.timezone);

        // Convert attendees to Options and reset to original
        const attendeeOptions: Option[] = baseEvent.attendees
          .filter((a) => !a.isOrganizer)
          .map((a) => ({
            value: a.email,
            label: a.name || a.email,
            responseStatus: a.response
          }));
        setLocalAttendees(attendeeOptions);
        // Reset original attendees to base event attendees (which are the true originals)
        setOriginalAttendees(attendeeOptions);
      }

      // Only when something was actually thrown away.
      if (changed) toast.success('Changes discarded');
    }
    onClose();
  }, [eventId, drafts, hasUnsavedChanges, discardEventChanges, onClose, getBaseEvent]);

  const handleDelete = useCallback(async () => {
    if (!eventId || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await removeEvent(eventId, eventHasAttendees);
      toast.success(
        isInvitee
          ? 'Removed from your calendar'
          : eventHasAttendees
            ? 'Meeting canceled'
            : 'Event deleted'
      );
      onEventDeleted?.(eventId);
      onClose();
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error("Couldn't delete the event");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [eventId, eventHasAttendees, isInvitee, removeEvent, onEventDeleted, onClose]);

  // Delete takes a second click on an explicit confirmation (it used to act on
  // the first, cancelling meetings for every attendee). The question reverts
  // on its own after a few seconds, but not while the pointer is on it.
  const closeConfirm = useCallback(() => {
    const hadFocus = !!confirmRowRef.current?.contains(document.activeElement);
    setConfirmingDelete(false);
    if (hadFocus) requestAnimationFrame(() => deleteButtonRef.current?.focus());
  }, []);
  useEffect(() => {
    if (!confirmingDelete) return;
    backButtonRef.current?.focus();
  }, [confirmingDelete]);
  useEffect(() => {
    if (!confirmingDelete || deleting || holdConfirm) return;
    const timer = window.setTimeout(closeConfirm, 4000);
    return () => window.clearTimeout(timer);
  }, [confirmingDelete, deleting, holdConfirm, closeConfirm]);

  const handleRsvp = async (response: RsvpResponse) => {
    if (!event || rsvpSending || response === rsvp) return;
    const previous = rsvp;
    setRsvp(response);
    setRsvpSending(true);
    try {
      await calendarApi.sendEventRsvp({
        calendarId: 'primary',
        eventId: event.id,
        responseStatus: response,
        // Outlook only tells the organizer when asked to; Google records the
        // reply on the event either way.
        sendNotifications: eventAccount?.provider === 'microsoft',
        uid: event.accountUid
      });
      toast.success(RSVP_OPTIONS.find((option) => option.value === response)?.done);
      onEventUpdated?.(event.id);
    } catch (error) {
      console.error('Failed to send RSVP:', error);
      setRsvp(previous);
      toast.error("Couldn't send your response");
    } finally {
      setRsvpSending(false);
    }
  };

  // ============================================================================
  // DISPLAY
  // ============================================================================

  // Join button for online meetings: conference entry points first, then the
  // location and the body (where Outlook puts the Teams link).
  const joinLink = useMemo(
    () =>
      mode === 'edit'
        ? findJoinLink([
            ...(event?.conferenceData?.entryPoints ?? [])
              .filter((entry) => entry.entryPointType === 'video')
              .map((entry) => entry.uri),
            localLocation,
            localDescription
          ])
        : null,
    [mode, event?.conferenceData, localDescription, localLocation]
  );
  const descriptionIsHtml = useMemo(() => looksLikeHtml(localDescription), [localDescription]);
  const descriptionText = useMemo(
    () => (descriptionIsHtml ? htmlToPlainText(localDescription) : ''),
    [descriptionIsHtml, localDescription]
  );

  // Times are entered and shown in the computer's time zone (the grid too),
  // so say which. The old picker here relabeled times without converting them.
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zoneCaption = `${getTimezoneLongName(localZone, localStart)} (${getTimezoneAbbreviation(localZone, localStart)})`;

  // The organizer row: this account for its own and new events. An
  // invitation named this account "Organizer" too; it shows the organizer the
  // event lists instead (Google does, Outlook's attendee list leaves them out).
  const organizerAttendee = event?.attendees.find((a) => a.isOrganizer);
  const organizer = isInvitee
    ? organizerAttendee && { name: organizerAttendee.name, email: organizerAttendee.email }
    : {
        name: accounts.find((a) => a.uid === selectedAccountUid)?.displayName,
        email: accounts.find((a) => a.uid === selectedAccountUid)?.email || ''
      };

  const notifiedCount = localAttendees.length;
  const deleteCopy = isInvitee
    ? { action: 'Remove', question: 'Remove this event from your calendar?', confirm: 'Remove' }
    : eventHasAttendees
      ? {
          action: 'Delete',
          question:
            notifiedCount > 0
              ? `Cancel this meeting and notify ${notifiedCount} ${notifiedCount === 1 ? 'person' : 'people'}?`
              : 'Cancel this meeting and notify attendees?',
          confirm: 'Cancel meeting'
        }
      : { action: 'Delete', question: 'Delete this event?', confirm: 'Delete' };

  const primaryLabel =
    mode === 'create'
      ? localAttendees.length > 0
        ? 'Create & invite'
        : 'Create'
      : eventHasAttendees && !isInvitee
        ? 'Send updates'
        : 'Save';
  // Why the primary button is disabled (a disabled button can't show a tooltip).
  const saveHint =
    mode === 'create' ? (titleMissing ? 'Add a title' : null) : !hasChanges ? 'No changes' : null;

  const timeValue = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="min-w-[360px] max-w-[380px] space-y-2 p-2 outline-none"
      onKeyDown={(e) => {
        // ⌘↩ saves, as in compose.
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          if (!saveDisabled) void handleSave();
        }
      }}
    >
      {/* Title */}
      <Input
        ref={titleRef}
        placeholder="Title"
        aria-label="Title"
        value={localTitle}
        onChange={(e) => handleTitleChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter creates a new event, like a one-line form.
          if (e.key !== 'Enter' || mode !== 'create' || e.nativeEvent.isComposing) return;
          e.preventDefault();
          e.stopPropagation();
          if (!saveDisabled) void handleSave();
        }}
        className="rounded-md"
      />

      {joinLink && (
        <Button
          variant="default"
          sizeVariant="sm"
          className="w-full"
          onClick={() => window.open(joinLink.url, '_blank')}
        >
          <MonoIcon type="ExternalLink" className="mr-1.5 h-3.5 w-3.5" />
          {joinLink.label}
        </Button>
      )}

      {isInvitee && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Going?</span>
          <div role="group" aria-label="Your response" className="flex gap-1">
            {RSVP_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={rsvp === option.value ? 'default' : 'secondary'}
                sizeVariant="xs"
                className="px-2.5"
                aria-pressed={rsvp === option.value}
                disabled={rsvpSending}
                onClick={() => handleRsvp(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Account selector (create mode only, and only when there's a choice) */}
      {mode === 'create' && accounts.length > 1 && (
        <div className="space-y-1">
          <label htmlFor={accountSelectId} className="text-xs text-muted-foreground">
            Account
          </label>
          <Select value={selectedAccountUid} onValueChange={setSelectedAccountUid}>
            <SelectTrigger id={accountSelectId} className="w-full min-w-0 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {accounts.map((acc) => (
                <SelectItem key={acc.uid} value={acc.uid}>
                  {/* Name and address: two accounts often share a name. */}
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getAccountColor(preference, acc.uid) }}
                    />
                    <span className="truncate">{acc.displayName || acc.email}</span>
                    {acc.displayName && acc.displayName !== acc.email && (
                      <span className="truncate text-xs text-muted-foreground">{acc.email}</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Date & time: the date first and always present, so toggling All-day
          below only hides the times and nothing under the cursor moves. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <DateInput
          className="h-8 w-[112px] px-2 shadow-sm"
          value={localStart}
          onValueChange={(d) => {
            const newStart = new Date(d);
            newStart.setHours(localStart.getHours(), localStart.getMinutes(), 0, 0);
            const duration = localEnd.getTime() - localStart.getTime();
            const newEnd = new Date(newStart.getTime() + Math.max(duration, 15 * 60 * 1000));
            setLocalStart(newStart);
            setLocalEnd(newEnd);
            if (eventId) {
              updateEventFields(eventId, {
                start: {
                  dateTime: localAllDay ? null : newStart.toISOString(),
                  date: localAllDay ? formatDateForGoogleCalendar(newStart) : null,
                  timeZone: localTimeZone
                },
                end: {
                  dateTime: localAllDay ? null : newEnd.toISOString(),
                  date: localAllDay
                    ? formatDateForGoogleCalendar(addDayForGoogleCalendar(newEnd))
                    : null,
                  timeZone: localTimeZone
                }
              });
            }
          }}
        />
        {!localAllDay && (
          <>
            <TimeInput
              keepPopoverAttr
              aria-label="Start time"
              className="w-[100px]"
              value={timeValue(localStart)}
              onValueChange={(v) => {
                const [h, m] = v.split(':').map((n) => parseInt(n, 10));
                if (!isNaN(h) && !isNaN(m)) {
                  const newStart = new Date(localStart);
                  newStart.setHours(h, m, 0, 0);
                  handleTimeChange('start', newStart);
                }
              }}
            />
            <span className="text-sm text-muted-foreground">–</span>
            <TimeInput
              keepPopoverAttr
              aria-label="End time"
              className="w-[100px]"
              value={timeValue(localEnd)}
              onValueChange={(v) => {
                const [h, m] = v.split(':').map((n) => parseInt(n, 10));
                if (!isNaN(h) && !isNaN(m)) {
                  const newEnd = new Date(localEnd);
                  newEnd.setHours(h, m, 0, 0);
                  handleTimeChange('end', newEnd);
                }
              }}
            />
          </>
        )}
      </div>
      {timesInvalid && (
        <div role="alert" className="text-xs text-destructive">
          The end time must be after the start time.
        </div>
      )}

      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch size="sm" checked={localAllDay} onCheckedChange={handleAllDayChange} />
          All-day
        </label>
        {!localAllDay && (
          <span
            className="ml-auto min-w-0 truncate text-xs text-muted-foreground"
            title={localZone}
          >
            {zoneCaption}
          </span>
        )}
      </div>

      {/* Location */}
      <Input
        placeholder="Location"
        aria-label="Location"
        value={localLocation}
        onChange={(e) => handleLocationChange(e.target.value)}
        className="rounded-md"
      />

      {/* Attendees */}
      <ParticipantListInput
        contacts={contactArray}
        organizer={organizer}
        value={localAttendees}
        onChange={handleAttendeesChange}
        originalAttendees={originalAttendees}
        showDraftChanges={mode === 'edit' && !!eventId}
        attendeeChanges={
          eventId && drafts[eventId]?.removedAttendeeEmails
            ? drafts[eventId].removedAttendeeEmails!.map((email) => ({
                type: 'removed' as const,
                email
              }))
            : []
        }
        onRemoveAttendee={handleRemoveAttendee}
        onReAddAttendee={handleReAddAttendee}
      />

      {/* Draft Status (edit mode only) */}
      {mode === 'edit' && eventId && hasUnsavedChanges(eventId) && (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
              status === 'error'
                ? 'bg-destructive/10 text-destructive'
                : status === 'draft' || status === 'saving'
                  ? 'bg-secondary-accent/15 text-foreground'
                  : 'bg-muted text-muted-foreground'
            )}
          >
            {(status === 'draft' || status === 'saving') && (
              <span className="h-1.5 w-1.5 rounded-full bg-secondary-accent" />
            )}
            {status === 'draft' && 'Draft'}
            {status === 'saving' && 'Saving...'}
            {status === 'error' && 'Error'}
          </div>
          {status === 'error' && draft && (
            <Button
              variant="text"
              sizeVariant="xs"
              className="h-auto px-0 font-medium text-destructive hover:text-destructive/80"
              onClick={handleSave}
              disabled={busy}
            >
              Retry
            </Button>
          )}
          {eventHasAttendees && !isInvitee && status === 'draft' && (
            <span className="text-xs text-muted-foreground">
              Changes will be held until you send updates
            </span>
          )}
        </div>
      )}

      {/* Description: an HTML body (Outlook) reads as text until you edit it,
          and editing shows the raw value as before. */}
      {descriptionIsHtml && !editingDescription ? (
        <div>
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {descriptionText || <span className="text-muted-foreground">No description</span>}
          </div>
          <Button
            variant="text"
            sizeVariant="xs"
            className="mt-1 h-auto px-0 text-muted-foreground hover:text-foreground"
            onClick={() => setEditingDescription(true)}
          >
            Edit description
          </Button>
        </div>
      ) : (
        <Textarea
          placeholder="Add description"
          aria-label="Description"
          className="min-h-[80px]"
          value={localDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          autoFocus={editingDescription}
          style={{ resize: 'none' }}
        />
      )}

      {/* Actions */}
      {confirmingDelete ? (
        <div
          ref={confirmRowRef}
          className="flex items-center gap-2 rounded-md bg-destructive/10 p-2"
          onPointerEnter={() => setHoldConfirm(true)}
          onPointerLeave={() => setHoldConfirm(false)}
        >
          <span className="min-w-0 flex-1 text-xs text-destructive">{deleteCopy.question}</span>
          <Button
            ref={backButtonRef}
            variant="secondary"
            sizeVariant="sm"
            onClick={closeConfirm}
            disabled={deleting}
          >
            Back
          </Button>
          <Button variant="destructive" sizeVariant="sm" onClick={handleDelete} disabled={deleting}>
            {deleting && <MonoIcon type="Loader2" className="mr-1 h-3 w-3 animate-spin" />}
            {deleteCopy.confirm}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          {/* "Cancel" read like "cancel the meeting"; say what it does. */}
          <Button variant="secondary" sizeVariant="sm" onClick={handleDiscard} disabled={busy}>
            {mode === 'create' ? 'Cancel' : hasChanges ? 'Discard' : 'Close'}
          </Button>

          {mode === 'edit' && eventId && (
            <Button
              ref={deleteButtonRef}
              variant="ghost"
              sizeVariant="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              {deleteCopy.action}
            </Button>
          )}

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {saveHint && !busy && (
              <span className="truncate text-xs text-muted-foreground">{saveHint}</span>
            )}
            <Button variant="default" sizeVariant="sm" onClick={handleSave} disabled={saveDisabled}>
              {isLoading || submitting ? (
                <MonoIcon type="Loader2" className="mr-1 h-3 w-3 animate-spin" />
              ) : eventHasAttendees && mode === 'edit' && !isInvitee ? (
                <MonoIcon type="Send" className="mr-1 h-3 w-3" />
              ) : null}
              {primaryLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarEventEditor;
