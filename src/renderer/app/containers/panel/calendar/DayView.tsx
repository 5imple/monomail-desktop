import React from 'react';
import { cn } from '@/renderer/app/lib/utils';
import {
  addDays,
  format,
  isSameDay,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  addHours,
  addMinutes
} from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { CalendarEvent, CalendarViewProps } from '@/renderer/app/store/calendar/calendarAtoms';
import { GRID_CONSTANTS } from './constants';
import { getEventDateRange, eventSpansDay } from './utils';
import { CurrentTimeLine, DraggableEvent, DroppableTimeSlot, DragSelectionOverlay } from './shared';
import { TimezoneSelector } from './TimezoneSelector';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragMoveEvent,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';

interface DayViewProps extends CalendarViewProps {
  date: Date;
  numDays?: number;
}

// Remembers the day grid's vertical scroll position per day-key for the session.
// DayView is unmounted/remounted when the user toggles DAY <-> AGENDA, which
// would otherwise reset scroll and re-snap to "now" — overwriting a manual
// scroll. Persisting here lets us restore the user's position across remounts.
const dayViewScrollByKey = new Map<string, number>();

// Local (not UTC) day-key — the time grid and the current-time line position
// everything in local time, so the key must be local to match.
const dayScrollKey = (date: Date, numDays: number): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${numDays}`;

export const DayView: React.FC<DayViewProps> = ({
  date,
  numDays = 1,
  events,
  activeEvent,
  getEventDraftStatus,
  onEventClick,
  onCreateEvent,
  onDragSelectionStart,
  onDragSelectionChange,
  onDragSelectionEnd,
  onClearSelection,
  isDragSelecting,
  dragSelection,
  pendingCreate,
  onPendingCreateRendered,
  selectedTimeZone,
  setSelectedTimeZone,
  userTimeZone,
  onEventDragEnd,
  onEventUpdate,
  preference,
  selectedAccountUids
}) => {
  // ============================================================================
  // COMPONENT STATE MANAGEMENT
  // ============================================================================

  // Ensure we only invoke pending-create popover once per unique range
  const pendingAnchorRef = React.useRef<HTMLElement | null>(null);
  const setPendingAnchorRef = React.useCallback((el: HTMLElement | null) => {
    pendingAnchorRef.current = el;
  }, []);
  const lastPendingKeyRef = React.useRef<string | null>(null);
  // Live drag state to enable real-time geometry updates
  const [activeDragEvent, setActiveDragEvent] = React.useState<{
    eventId: string;
    handle: 'move' | 'start' | 'end';
    originalEvent: CalendarEvent;
    currentDelta: { x: number; y: number };
    currentOver: string | null;
  } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const days = Array.from({ length: Math.min(Math.max(numDays, 1), 9) }, (_, i) =>
    addDays(date, i)
  );
  const isWeekView = days.length === 7;
  const timeColWidth = isWeekView
    ? GRID_CONSTANTS.WEEK_TIME_COL_WIDTH
    : GRID_CONSTANTS.DAY_TIME_COL_WIDTH;
  const slotHeight = isWeekView ? GRID_CONSTANTS.WEEK_SLOT_HEIGHT : GRID_CONSTANTS.DAY_SLOT_HEIGHT;
  const pixelsPerHour = isWeekView
    ? GRID_CONSTANTS.WEEK_PIXELS_PER_HOUR
    : GRID_CONSTANTS.DAY_PIXELS_PER_HOUR;

  const timeSlots = Array.from({ length: 96 }, (_, i) => ({
    hour: Math.floor(i / 4),
    minute: (i % 4) * 15,
    index: i
  }));

  // Visual gap between overlapping columns (in pixels)
  const OVERLAP_GAP_PX = 2;

  // Helper: parse slot/day id formats to date/hour/minute
  const parseSlotId = (id: string): { date: Date; hour?: number; minute?: number } | null => {
    try {
      if (id.startsWith('slot-')) {
        const rest = id.slice('slot-'.length);
        const parts = rest.split('-');
        if (parts.length < 5) return null; // YYYY-MM-DD-HH-mm
        const [yyyyStr, mmStr, ddStr, hhStr, minStr] = parts;
        const yyyy = parseInt(yyyyStr, 10);
        const mm = parseInt(mmStr, 10);
        const dd = parseInt(ddStr, 10);
        const hour = parseInt(hhStr, 10);
        const minute = parseInt(minStr, 10);
        if ([yyyy, mm, dd].some((v) => Number.isNaN(v))) return null;
        const dateObj = new Date(yyyy, mm - 1, dd);
        return { date: dateObj, hour, minute };
      }
      if (id.startsWith('day-')) {
        const rest = id.slice('day-'.length);
        const parts = rest.split('-');
        if (parts.length < 3) return null; // YYYY-MM-DD
        const [yyyyStr, mmStr, ddStr] = parts;
        const yyyy = parseInt(yyyyStr, 10);
        const mm = parseInt(mmStr, 10);
        const dd = parseInt(ddStr, 10);
        if ([yyyy, mm, dd].some((v) => Number.isNaN(v))) return null;
        return { date: new Date(yyyy, mm - 1, dd) };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Fire onPendingCreateRendered only once per unique start/end range
  React.useEffect(() => {
    if (!pendingCreate) {
      lastPendingKeyRef.current = null;
      return;
    }
    const key = `${pendingCreate.start.getTime()}-${pendingCreate.end.getTime()}`;
    if (
      pendingAnchorRef.current &&
      lastPendingKeyRef.current !== key &&
      typeof onPendingCreateRendered === 'function'
    ) {
      try {
        onPendingCreateRendered(pendingAnchorRef.current, pendingCreate.start, pendingCreate.end);
      } finally {
        lastPendingKeyRef.current = key;
      }
    }
  }, [pendingCreate, onPendingCreateRendered]);

  // Track event position changes (start/end times, allDay status, timezone changes)
  React.useEffect(() => {
    if (!events || events.length === 0) return;
  }, [events, getEventDraftStatus]);

  // Track active event and draft status changes that affect visual positioning
  React.useEffect(() => {
    if (!activeEvent) return;

    // Check if active event has draft changes that affect positioning
    getEventDraftStatus?.(activeEvent.id);
  }, [activeEvent, getEventDraftStatus, selectedTimeZone]);

  // Track timezone changes that affect all event positions
  React.useEffect(() => {
    if (!events || events.length === 0) return;
  }, [selectedTimeZone, events.length, date]);

  // Auto-scroll the day grid on open / date change. Behavior per day-key:
  //  - if the user already has a remembered scroll position for this day
  //    (incl. after a DAY<->AGENDA remount), restore it — never fight a manual
  //    scroll;
  //  - otherwise scroll to ~2h before "now" for today (so now sits in view with
  //    context above) or 8am for other days.
  // Positioning is LOCAL time, matching the grid layout and the red current-time
  // line in shared.tsx (CurrentTimeLine), and "today" uses the same isSameDay
  // check the day headers / current-time line use — so the scroll lands exactly
  // where the red line is.
  const hasAutoScrolledRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = dayScrollKey(date, numDays);
    if (hasAutoScrolledRef.current === key) return;
    const viewport = document.getElementById('calendar-day-viewport');
    if (!viewport) return;
    hasAutoScrolledRef.current = key;

    const remembered = dayViewScrollByKey.get(key);
    if (remembered !== undefined) {
      viewport.scrollTo({ top: remembered, behavior: 'auto' });
      return;
    }

    const now = new Date();
    const isToday = isSameDay(date, now);
    const targetHour = isToday ? Math.max(0, now.getHours() - 2) : 8;
    const top = targetHour * pixelsPerHour;
    viewport.scrollTo({ top, behavior: 'auto' });
    dayViewScrollByKey.set(key, top);
  }, [date, numDays, pixelsPerHour]);

  // Persist the user's manual scroll position per day-key so it survives the
  // DAY<->AGENDA remount (see dayViewScrollByKey above).
  React.useEffect(() => {
    const viewport = document.getElementById('calendar-day-viewport');
    if (!viewport) return;
    const key = dayScrollKey(date, numDays);
    const onScroll = () => dayViewScrollByKey.set(key, viewport.scrollTop);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [date, numDays]);

  // Merge live drag delta/over to reflect real-time during drag
  const getEventWithDragLive = (event: CalendarEvent): CalendarEvent => {
    const base = event;
    if (!activeDragEvent || activeDragEvent.eventId !== event.id) return base;
    try {
      const { start: origStart, end: origEnd } = getEventDateRange(base);
      if (!origStart || !origEnd) return base;

      // Prefer precise hovered slot/day
      let targetDate: Date | null = null;
      let targetHour: number | undefined;
      let targetMinute: number | undefined;
      if (activeDragEvent.currentOver) {
        const parsed = parseSlotId(String(activeDragEvent.currentOver));
        if (parsed) {
          targetDate = parsed.date;
          targetHour = parsed.hour;
          targetMinute = parsed.minute;
        }
      }

      let newStart = new Date(origStart);
      let newEnd = new Date(origEnd);
      const pixelsPerMinute = pixelsPerHour / 60;
      const deltaY = activeDragEvent.currentDelta?.y || 0;
      const deltaMinutesRaw = pixelsPerMinute > 0 ? deltaY / pixelsPerMinute : 0;
      const deltaMinutes = Math.round(deltaMinutesRaw / 15) * 15;

      const handle = activeDragEvent.handle;

      if (targetDate && targetHour !== undefined && targetMinute !== undefined) {
        if (handle === 'move') {
          const duration = newEnd.getTime() - newStart.getTime();
          newStart = new Date(targetDate);
          newStart.setHours(targetHour, targetMinute, 0, 0);
          newEnd = new Date(newStart.getTime() + duration);
        } else if (handle === 'start') {
          newStart = new Date(targetDate);
          newStart.setHours(targetHour, targetMinute, 0, 0);
          if (newStart >= newEnd) newStart = new Date(newEnd.getTime() - 15 * 60 * 1000);
        } else if (handle === 'end') {
          newEnd = new Date(targetDate);
          newEnd.setHours(targetHour, targetMinute, 0, 0);
          if (newEnd <= newStart) newEnd = new Date(newStart.getTime() + 15 * 60 * 1000);
        }
      } else {
        if (handle === 'move') {
          newStart = addMinutes(newStart, deltaMinutes);
          newEnd = addMinutes(newEnd, deltaMinutes);
        } else if (handle === 'start') {
          const nextStart = addMinutes(newStart, deltaMinutes);
          const maxStart = new Date(newEnd.getTime() - 15 * 60 * 1000);
          newStart = nextStart > maxStart ? maxStart : nextStart;
        } else if (handle === 'end') {
          const nextEnd = addMinutes(newEnd, deltaMinutes);
          const minEnd = new Date(newStart.getTime() + 15 * 60 * 1000);
          newEnd = nextEnd > minEnd ? nextEnd : minEnd;
        }
      }

      const clone: CalendarEvent = {
        ...(base as CalendarEvent),
        start: {
          ...(base.start as unknown as {
            dateTime?: string | null;
            date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null;
            timeZone?: string | null;
          })
        },
        end: {
          ...(base.end as unknown as {
            dateTime?: string | null;
            date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null;
            timeZone?: string | null;
          })
        }
      } as CalendarEvent;
      // Force timed form during drag preview
      (
        clone.start as unknown as {
          dateTime?: string | null;
          date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null;
        }
      ).dateTime = newStart.toISOString();
      (
        clone.end as unknown as {
          dateTime?: string | null;
          date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null;
        }
      ).dateTime = newEnd.toISOString();
      delete (
        clone.start as unknown as {
          date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null;
        }
      ).date;
      delete (
        clone.end as unknown as {
          date?: string | { value: number; dateOnly: boolean; timeZoneShift: number } | null;
        }
      ).date;
      return clone;
    } catch {
      return base;
    }
  };

  // Memoize filtered events to ensure they update when layout version changes
  const getTimedEvents = React.useCallback(
    (targetDate: Date) =>
      events.filter((event) => {
        try {
          // The events prop already contains merged events with draft changes
          // Apply only live drag changes on top
          const eventWithDrag = getEventWithDragLive(event);
          const { isAllDay } = getEventDateRange(eventWithDrag, selectedTimeZone);

          if (isAllDay) return false;
          return eventSpansDay(eventWithDrag, targetDate, selectedTimeZone);
        } catch {
          return false;
        }
      }),
    [events, selectedTimeZone, activeDragEvent, getEventDraftStatus]
  );

  // Compute column layout for overlapping events within a single day
  const computeOverlapLayout = (
    timedDayEvents: CalendarEvent[],
    targetDate: Date
  ): Map<string, { column: number; columns: number }> => {
    try {
      // Convert to clipped day-bounds minute ranges for robust comparisons
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);
      type TimedWithBounds = {
        id: string;
        startMin: number; // minutes from day start
        endMin: number; // minutes from day start
        ref: CalendarEvent;
      };
      const items: TimedWithBounds[] = timedDayEvents
        .map((e) => {
          const { start, end } = getEventDateRange(getEventWithDragLive(e), selectedTimeZone);
          if (!start || !end) return null;
          // Clip to current day bounds
          const s = start < dayStart ? dayStart : start;
          const eEnd = end > dayEnd ? dayEnd : end;
          const duration = Math.max(15, differenceInMinutes(eEnd, s));
          return {
            id: e.id,
            startMin: Math.max(0, differenceInMinutes(s, dayStart)),
            endMin: Math.min(24 * 60, Math.max(0, differenceInMinutes(s, dayStart) + duration)),
            ref: e
          } as TimedWithBounds;
        })
        .filter(Boolean) as TimedWithBounds[];

      // Sort by start then by longer duration first (helps stable column assignment)
      items.sort((a, b) =>
        a.startMin !== b.startMin ? a.startMin - b.startMin : b.endMin - a.endMin
      );

      const layout = new Map<string, { column: number; columns: number }>();

      // Track current cluster (continuous overlaps)
      let active: Array<{ id: string; endMin: number; column: number }> = [];
      let clusterEventIds: string[] = [];
      let clusterMaxColumns = 0;

      const finalizeCluster = () => {
        if (clusterEventIds.length === 0) return;
        const totalColumns = Math.max(1, clusterMaxColumns);
        for (const id of clusterEventIds) {
          const prev = layout.get(id);
          if (prev) layout.set(id, { column: prev.column, columns: totalColumns });
        }
        // reset trackers
        active = [];
        clusterEventIds = [];
        clusterMaxColumns = 0;
      };

      for (const item of items) {
        // Remove finished events from active
        active = active.filter((a) => a.endMin > item.startMin);
        if (active.length === 0 && clusterEventIds.length > 0) {
          finalizeCluster();
        }

        // Determine the first free column index
        const usedColumns = new Set(active.map((a) => a.column));
        let assignColumn = 0;
        while (usedColumns.has(assignColumn)) assignColumn += 1;

        // Place current item
        active.push({ id: item.id, endMin: item.endMin, column: assignColumn });
        clusterEventIds.push(item.id);
        clusterMaxColumns = Math.max(clusterMaxColumns, assignColumn + 1);
        layout.set(item.id, { column: assignColumn, columns: 1 }); // columns filled when cluster finalizes
      }

      // Finalize the last cluster
      finalizeCluster();
      return layout;
    } catch {
      return new Map();
    }
  };

  const calculateEventPosition = (event: CalendarEvent, targetDate: Date) => {
    try {
      const eventWithDrag = getEventWithDragLive(event);
      const { start: eventStart, end: eventEnd } = getEventDateRange(
        eventWithDrag,
        selectedTimeZone
      );
      if (!eventStart || !eventEnd) return { top: 0, height: 20 };
      if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) return { top: 0, height: 20 };
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);
      let displayStart = eventStart;
      let displayEnd = eventEnd;
      if (eventStart < dayStart) displayStart = dayStart;
      if (eventEnd > dayEnd) displayEnd = dayEnd;
      const minutesFromDayStart = differenceInMinutes(displayStart, dayStart);
      const durationMinutes = differenceInMinutes(displayEnd, displayStart);
      const pixelsPerMinute = pixelsPerHour / 60;
      const top = minutesFromDayStart * pixelsPerMinute;
      const height = Math.max(durationMinutes * pixelsPerMinute, slotHeight);
      return { top, height };
    } catch {
      return { top: 0, height: 20 };
    }
  };

  // Memoize filtered events to ensure they update when layout version changes
  const getAllDayEvents = React.useCallback(
    (targetDate: Date) =>
      events.filter((event) => {
        try {
          // The events prop already contains merged events with draft changes
          // Apply only live drag changes on top
          const eventWithDrag = getEventWithDragLive(event);
          const { isAllDay } = getEventDateRange(eventWithDrag, selectedTimeZone);

          // For all-day events, check if they span the target day (not just start on it)
          if (isAllDay) {
            return eventSpansDay(eventWithDrag, targetDate, selectedTimeZone);
          }
          return false;
        } catch {
          return false;
        }
      }),
    [events, selectedTimeZone, activeDragEvent, getEventDraftStatus]
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || !active?.data?.current) return;
    const data = active.data.current as { event: CalendarEvent; handle: 'move' | 'start' | 'end' };
    const drop = parseSlotId(String(over.id));
    if (!drop) return;
    try {
      const event = data.event as CalendarEvent;
      const handle = data.handle as 'move' | 'start' | 'end';
      const { start: origStart, end: origEnd } = getEventDateRange(event);
      if (!origStart || !origEnd) return;

      const durationMs = origEnd.getTime() - origStart.getTime();
      let newStart = new Date(origStart);
      let newEnd = new Date(origEnd);

      if (handle === 'move') {
        if (drop.hour !== undefined && drop.minute !== undefined) {
          newStart = new Date(drop.date);
          newStart.setHours(drop.hour, drop.minute, 0, 0);
          newEnd = new Date(newStart.getTime() + durationMs);
        } else {
          if (event.start.dateTime && event.end.dateTime) {
            newStart = new Date(drop.date);
            newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
            newEnd = new Date(newStart.getTime() + durationMs);
          } else {
            newStart = new Date(drop.date);
            newStart.setHours(0, 0, 0, 0);
            newEnd = new Date(drop.date);
            newEnd.setHours(23, 59, 59, 999);
          }
        }
      } else if (handle === 'start') {
        if (drop.hour !== undefined && drop.minute !== undefined) {
          newStart = new Date(drop.date);
          newStart.setHours(drop.hour, drop.minute, 0, 0);
          if (newStart >= origEnd) newStart = new Date(origEnd.getTime() - 15 * 60 * 1000);
        }
      } else if (handle === 'end') {
        if (drop.hour !== undefined && drop.minute !== undefined) {
          newEnd = new Date(drop.date);
          newEnd.setHours(drop.hour, drop.minute, 0, 0);
          if (newEnd <= origStart) newEnd = new Date(origStart.getTime() + 15 * 60 * 1000);
        }
      }

      // Create updated event for optimistic UI update
      const updatedEvent: CalendarEvent = {
        ...event,
        start: {
          ...event.start,
          dateTime: newStart.toISOString(),
          date: null
        },
        end: {
          ...event.end,
          dateTime: newEnd.toISOString(),
          date: null
        }
      };

      // Update local state immediately for responsive UI
      if (typeof onEventUpdate === 'function') {
        onEventUpdate(updatedEvent);
      }

      // Then call API in background
      if (typeof onEventDragEnd === 'function') {
        onEventDragEnd(event, newStart, newEnd);
      }
    } catch {
      // ignore
    }
    setActiveDragEvent(null);
  };

  const handleDragStart = (e: DragStartEvent) => {
    const { active } = e;
    if (!active?.data?.current) return;
    const data = active.data.current as { event: CalendarEvent; handle: 'move' | 'start' | 'end' };
    if (!data?.event) return;
    // Hide any open popover when starting a drag to avoid duplicates
    try {
      onClearSelection?.();
    } catch {
      // ignore
    }
    setActiveDragEvent({
      eventId: data.event.id,
      handle: data.handle,
      originalEvent: data.event,
      currentDelta: { x: 0, y: 0 },
      currentOver: null
    });
  };

  const handleDragMove = (e: DragMoveEvent) => {
    if (!activeDragEvent) return;
    const { delta, over } = e;
    setActiveDragEvent((prev) =>
      prev
        ? {
            ...prev,
            currentDelta: { x: delta.x, y: delta.y },
            currentOver: over ? String(over.id) : null
          }
        : prev
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        {/* Header section with day names - always visible */}
        <div className="flex gap-0 border-b">
          <TimezoneSelector
            selectedTimeZone={selectedTimeZone}
            setSelectedTimeZone={setSelectedTimeZone}
            userTimeZone={userTimeZone}
            className=""
            style={{ width: `${timeColWidth}px` }}
          />
          <div className="flex flex-1">
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex-1 overflow-hidden border-r p-2 text-center text-sm last:border-r-0',
                  isSameDay(day, new Date()) ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center gap-1 overflow-hidden text-xs',
                    isSameDay(day, new Date()) && 'font-medium'
                  )}
                >
                  <span className="truncate">{format(day, 'EEE')}</span>
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-sm',
                      isSameDay(day, new Date()) && 'bg-destructive text-destructive-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* All-day events section - sticky at top */}
        {(() => {
          const allAllDayEvents = days.flatMap((day) => getAllDayEvents(day));
          if (allAllDayEvents.length === 0) return null;
          return (
            <div className="sticky top-0 z-30 border-b shadow-sm" data-all-day-section="true">
              <div className="relative flex gap-0">
                <div
                  className="flex min-h-[32px] items-center border-r"
                  style={{ width: `${timeColWidth}px` }}
                >
                  <div className="flex w-full items-center justify-center px-1 text-xs text-muted-foreground">
                    All-day
                  </div>
                </div>
                <div className="flex flex-1">
                  {days.map((day) => {
                    const dayAllDayEvents = getAllDayEvents(day);
                    return (
                      <div
                        key={`allday-${day.toISOString()}`}
                        className="relative min-h-[32px] flex-1"
                      >
                        <DroppableTimeSlot
                          id={`day-${format(day, 'yyyy-MM-dd')}`}
                          date={day}
                          onCreateEvent={onCreateEvent}
                          onDragSelectionStart={onDragSelectionStart}
                          onDragSelectionChange={onDragSelectionChange}
                          onDragSelectionEnd={onDragSelectionEnd}
                          onClearSelection={onClearSelection}
                          isDragSelecting={isDragSelecting}
                          allowDoubleClickCreate={true}
                          className={cn('absolute inset-0 transition-colors hover:bg-muted/20')}
                        />
                        <div className="space-y-1 p-2">
                          {dayAllDayEvents.map((event) => {
                            return (
                              <DraggableEvent
                                key={event.id}
                                event={event}
                                onClick={(target) => onEventClick(event, target)}
                                className="text-xs"
                                isActive={activeEvent?.id === event.id}
                                isDraft={getEventDraftStatus?.(event.id) === 'draft'}
                                currentDate={day}
                                preference={preference}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Scrollable time slots section */}
        {/* relative+flex-1 wrapper gives the ScrollArea a guaranteed definite
            height (via absolute inset-0) so the time grid actually scrolls —
            flex/percentage height alone was leaving it unbounded. */}
        <div className="relative min-h-0 w-full flex-1">
          <ScrollArea className="absolute inset-0" viewportId="calendar-day-viewport">
            <div className="relative">
            <div className="flex flex-col">
              {timeSlots.map(({ hour, minute, index }) => (
                <div key={index} className="flex">
                  {minute === 0 ? (
                    <div
                      className={cn(
                        'sticky left-0 flex flex-col items-center justify-center border-r bg-muted/50 px-1 text-center text-muted-foreground',
                        hour === 0 ? '' : 'border-t'
                      )}
                      style={{
                        height: `${slotHeight}px`,
                        width: `${timeColWidth}px`,
                        maxWidth: `${timeColWidth}px`
                      }}
                    >
                      <div className="text-[10px] font-medium leading-tight">
                        {formatInTimeZone(
                          addHours(startOfDay(new Date()), hour),
                          selectedTimeZone,
                          'h a'
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="sticky left-0 flex items-center justify-center border-r bg-muted/50"
                      style={{
                        height: `${slotHeight}px`,
                        width: `${timeColWidth}px`,
                        maxWidth: `${timeColWidth}px`
                      }}
                    />
                  )}
                  <div className="flex flex-1">
                    {days.map((day) => (
                      <DroppableTimeSlot
                        key={`slot-${day.toISOString()}-${hour}-${minute}`}
                        id={`slot-${format(day, 'yyyy-MM-dd')}-${hour}-${minute}`}
                        date={day}
                        hour={hour}
                        minute={minute}
                        onCreateEvent={onCreateEvent}
                        onDragSelectionStart={onDragSelectionStart}
                        onDragSelectionChange={onDragSelectionChange}
                        onDragSelectionEnd={onDragSelectionEnd}
                        onClearSelection={onClearSelection}
                        isDragSelecting={isDragSelecting}
                        allowDoubleClickCreate={true}
                        className={cn(
                          'flex-1 border-r transition-colors last:border-r-0 hover:bg-muted',
                          minute === 0 ? (hour === 0 ? '' : 'border-t') : 'border-b-muted/30'
                        )}
                        style={{ height: `${slotHeight}px` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {days.map((day, dayIndex) => {
              const timedEvents = getTimedEvents(day);
              const dayLeft = `calc(${timeColWidth}px + ${dayIndex} * (100% - ${timeColWidth}px) / ${days.length})`;
              const dayWidth = `calc((100% - ${timeColWidth}px) / ${days.length})`;
              const overlapLayout = computeOverlapLayout(timedEvents, day);
              return (
                <div key={`events-${day.toISOString()}`}>
                  {timedEvents.map((event) => {
                    const eventWithDrag = getEventWithDragLive(event);
                    const { top, height } = calculateEventPosition(event, day);
                    const layout = overlapLayout.get(event.id) || { column: 0, columns: 1 };
                    const col = Math.max(0, layout.column);
                    const cols = Math.max(1, layout.columns);
                    // Add small gaps between columns
                    const totalGapPx = OVERLAP_GAP_PX * (cols - 1);
                    const gapPerCol = cols > 1 ? OVERLAP_GAP_PX : 0;
                    const eventLeft = `calc(${dayLeft} + ((${dayWidth} - ${totalGapPx}px) * ${col} / ${cols}) + ${col * gapPerCol}px)`;
                    const eventWidth = `calc(((${dayWidth} - ${totalGapPx}px) / ${cols}))`;
                    return (
                      <div
                        key={`overlay-${event.id}-${day.toISOString()}`}
                        className="absolute z-10"
                        style={{
                          top: `${top}px`,
                          left: eventLeft,
                          width: eventWidth,
                          height: `${height}px`
                        }}
                      >
                        <DraggableEvent
                          event={eventWithDrag}
                          onClick={(target) => onEventClick(event, target)}
                          className="h-full text-xs"
                          style={{ height: '100%' }}
                          isActive={activeEvent?.id === event.id}
                          isDraft={getEventDraftStatus?.(event.id) === 'draft'}
                          currentDate={day}
                          pixelsPerHour={pixelsPerHour}
                          preference={preference}
                        />
                      </div>
                    );
                  })}
                  {/* Pending create block */}
                  {(() => {
                    try {
                      const pending = pendingCreate || null;
                      if (!pending) return null;
                      const { start, end } = pending as { start: Date; end: Date };
                      if (!isSameDay(start, day)) return null;
                      const topPos = (() => {
                        const minutes = differenceInMinutes(start, startOfDay(day));
                        return (minutes / 60) * pixelsPerHour;
                      })();
                      const heightPx = (() => {
                        const minutes = differenceInMinutes(end, start);
                        return Math.max((minutes / 60) * pixelsPerHour, slotHeight);
                      })();
                      return (
                        <div
                          className="absolute z-20"
                          style={{
                            top: `${topPos}px`,
                            left: dayLeft,
                            width: `calc((100% - ${timeColWidth}px) / ${days.length})`,
                            height: `${heightPx}px`
                          }}
                        >
                          <div
                            ref={setPendingAnchorRef}
                            className="group relative h-full cursor-pointer rounded-sm px-1 py-0.5 text-xs"
                            style={{
                              borderColor:
                                preference?.account?.accentColor?.[selectedAccountUids[0]] ||
                                '#035ddf',
                              backgroundColor: `${preference?.account?.accentColor?.[selectedAccountUids[0]] || '#035ddf'}10`
                            }}
                          ></div>
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              );
            })}

            <DragSelectionOverlay selection={dragSelection} currentView="day" />

            {days.some((day) => isSameDay(day, new Date())) && (
              <CurrentTimeLine
                currentView="day"
                viewDate={days.find((day) => isSameDay(day, new Date())) || days[0]}
                pixelsPerHour={pixelsPerHour}
                leftOffset="0%"
                width="100%"
                selectedTimeZone={selectedTimeZone}
              />
            )}
            </div>
          </ScrollArea>
        </div>
      </DndContext>
    </div>
  );
};

export default DayView;
