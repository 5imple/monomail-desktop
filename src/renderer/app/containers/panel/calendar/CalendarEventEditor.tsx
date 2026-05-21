import React, { useEffect, useState, useCallback } from 'react';
import { addDays } from 'date-fns';

import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import type { MonoAccount } from '@/main/api/auth/types';
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
  initialAccountUid
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
      if (field === 'start') {
        setLocalStart(date);
        // Ensure end is after start
        if (date >= localEnd) {
          const newEnd = new Date(date.getTime() + 3600000); // +1 hour
          setLocalEnd(newEnd);
          if (eventId) {
            updateEventFields(eventId, {
              start: {
                dateTime: localAllDay ? null : date.toISOString(),
                date: localAllDay ? formatDateForGoogleCalendar(date) : null,
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
        } else if (eventId) {
          updateEventField(eventId, 'start', {
            dateTime: localAllDay ? null : date.toISOString(),
            date: localAllDay ? formatDateForGoogleCalendar(date) : null,
            timeZone: localTimeZone
          });
        }
      } else {
        const newEnd = date <= localStart ? new Date(localStart.getTime() + 3600000) : date;
        setLocalEnd(newEnd);
        if (eventId) {
          updateEventField(eventId, 'end', {
            dateTime: localAllDay ? null : newEnd.toISOString(),
            date: localAllDay ? formatDateForGoogleCalendar(addDayForGoogleCalendar(newEnd)) : null,
            timeZone: localTimeZone
          });
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

  const handleSave = useCallback(async () => {
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
        toast.success('Event created successfully');
        onEventCreated?.(newEventId);
        onClose();
      } else if (eventId) {
        // Save existing event
        const accountsInfo = accounts.map((acc) => ({ uid: acc.uid, email: acc.email }));
        await saveEvent(eventId, eventHasAttendees, accountsInfo);
        const message = eventHasAttendees ? 'Updates sent to attendees' : 'Event updated';
        toast.success(message);
        onEventUpdated?.(eventId);
      }
    } catch (error) {
      console.error('Failed to save event:', error);
      toast.error('Failed to save event');
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
    addEvent,
    saveEvent,
    onEventCreated,
    onEventUpdated,
    onClose
  ]);

  const handleDiscard = useCallback(() => {
    if (eventId) {
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

      toast.success('Changes discarded');
    }
    onClose();
  }, [eventId, discardEventChanges, onClose, getBaseEvent]);

  const handleDelete = useCallback(async () => {
    if (!eventId) return;

    try {
      await removeEvent(eventId, eventHasAttendees);
      toast.success('Event deleted');
      onEventDeleted?.(eventId);
      onClose();
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error('Failed to delete event');
    }
  }, [eventId, eventHasAttendees, removeEvent, onEventDeleted, onClose]);

  // ============================================================================
  // TIME ZONE OPTIONS
  // ============================================================================

  const timeZones = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Central European Time' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'UTC', label: 'UTC' }
  ];

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-w-[360px] max-w-[380px] p-1">
      {/* Title */}
      <div className="p-1">
        <Input
          placeholder="Title"
          value={localTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="my-2 rounded-md"
        />
      </div>

      {/* Account selector (create mode only) */}
      {mode === 'create' && (
        <div className="p-1">
          <div className="mb-1 text-xs text-muted-foreground">Account</div>
          <Select value={selectedAccountUid} onValueChange={setSelectedAccountUid}>
            <SelectTrigger className="w-full shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark max-h-72 w-[360px]">
              {accounts.map((acc) => (
                <SelectItem key={acc.uid} value={acc.uid}>
                  {acc.displayName || acc.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Date & Time */}
      <div className="p-1">
        {!localAllDay && (
          <div className="my-2 flex items-center gap-2">
            <TimeInput
              value={`${String(localStart.getHours()).padStart(2, '0')}:${String(localStart.getMinutes()).padStart(2, '0')}`}
              onValueChange={(v) => {
                const [h, m] = v.split(':').map((n) => parseInt(n, 10));
                if (!isNaN(h) && !isNaN(m)) {
                  const newStart = new Date(localStart);
                  newStart.setHours(h, m, 0, 0);
                  handleTimeChange('start', newStart);
                }
              }}
            />
            <MonoIcon type="ChevronRight" className="h-4 w-4 text-muted-foreground" />
            <TimeInput
              value={`${String(localEnd.getHours()).padStart(2, '0')}:${String(localEnd.getMinutes()).padStart(2, '0')}`}
              onValueChange={(v) => {
                const [h, m] = v.split(':').map((n) => parseInt(n, 10));
                if (!isNaN(h) && !isNaN(m)) {
                  const newEnd = new Date(localEnd);
                  newEnd.setHours(h, m, 0, 0);
                  handleTimeChange('end', newEnd);
                }
              }}
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch size="sm" checked={localAllDay} onCheckedChange={handleAllDayChange} />
            <span className="text-sm">All-day</span>
            <DateInput
              className="shadow-sm"
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
          </div>

          {!localAllDay && (
            <div className="flex items-center gap-2">
              <Select value={localTimeZone} onValueChange={setLocalTimeZone}>
                <SelectTrigger className="w-[260px] shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark max-h-72 w-[360px]">
                  {timeZones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="p-1">
        <Input
          placeholder="Location"
          value={localLocation}
          onChange={(e) => handleLocationChange(e.target.value)}
          className="my-2 rounded-md"
        />
      </div>

      {/* Attendees */}
      <div className="p-1 pt-4">
        <ParticipantListInput
          contacts={contactArray}
          organizer={{
            name: accounts.find((a) => a.uid === selectedAccountUid)?.displayName,
            email: accounts.find((a) => a.uid === selectedAccountUid)?.email || ''
          }}
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
      </div>

      {/* Draft Status (edit mode only) */}
      {mode === 'edit' && eventId && hasUnsavedChanges(eventId) && (
        <div className="p-1">
          <div className="mb-2 flex items-center gap-2">
            <div
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                status === 'draft'
                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                  : status === 'saving'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                    : status === 'error'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
              }`}
            >
              {status === 'draft' && 'Draft'}
              {status === 'saving' && 'Saving...'}
              {status === 'error' && 'Error'}
            </div>
            {eventHasAttendees && status === 'draft' && (
              <span className="text-xs text-muted-foreground">
                Changes will be held until you send updates
              </span>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="p-1">
        <Textarea
          placeholder="Add description"
          className="min-h-[80px]"
          value={localDescription}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          style={{ resize: 'none' }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 p-1 pt-4">
        <Button variant="secondary" sizeVariant="sm" onClick={handleDiscard} disabled={isLoading}>
          Cancel
        </Button>

        {mode === 'edit' && eventId && (
          <Button
            variant="destructive"
            sizeVariant="sm"
            onClick={handleDelete}
            disabled={isLoading}
          >
            Delete
          </Button>
        )}

        <Button
          variant="default"
          sizeVariant="sm"
          onClick={handleSave}
          disabled={isLoading || !localTitle.trim()}
          className="ml-auto"
        >
          {isLoading ? (
            <MonoIcon type="Loader2" className="mr-1 h-3 w-3 animate-spin" />
          ) : eventHasAttendees && mode === 'edit' ? (
            <MonoIcon type="Send" className="mr-1 h-3 w-3" />
          ) : null}
          {mode === 'create' ? 'Create' : eventHasAttendees ? 'Send updates' : 'Save'}
        </Button>
      </div>
    </div>
  );
};

export default CalendarEventEditor;
