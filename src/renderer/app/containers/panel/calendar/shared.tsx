import React, { useEffect, useState } from 'react';
import { cn } from '@/renderer/app/lib/utils';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  format,
  startOfDay,
  differenceInMinutes,
  isSameDay,
  addMinutes,
  addHours,
  endOfDay
} from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  CalendarEvent,
  CalendarView,
  CalendarDragSelection,
  CalendarDragHandle
} from '@/renderer/app/store/calendar/calendarAtoms';
import { UserPreference } from '@/main/api/auth/types/user';
import { GRID_CONSTANTS } from './constants';
import { useCalendar } from '@/renderer/app/store/calendar/useCalendar';
import { getEventDateRange, isEventInPast } from './utils';

export const CurrentTimeLine: React.FC<{
  currentView: CalendarView;
  viewDate: Date; // kept for API parity; not directly used
  pixelsPerHour: number;
  leftOffset?: string;
  width?: string;
  days?: Date[];
  selectedTimeZone: string;
}> = ({
  currentView,
  viewDate,
  pixelsPerHour,
  leftOffset = '0%',
  width = '100%',
  days,
  selectedTimeZone
}) => {
  // viewDate is currently unused; keep prop for API parity
  void viewDate;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  if (currentView === 'month') return null;
  const startOfToday = startOfDay(now);
  const minutesFromStart = differenceInMinutes(now, startOfToday);
  const pixelsFromTop = (minutesFromStart / 60) * pixelsPerHour;
  const timeString = formatInTimeZone(now, selectedTimeZone, 'h:mm a');

  let lineLeft = '0%';
  let lineWidth = '100%';
  let currentDayIndex = -1;
  if (currentView === 'week') {
    currentDayIndex = days?.findIndex((d) => isSameDay(d, now)) ?? -1;
    lineLeft = `${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px`;
    lineWidth = `calc(100% - ${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px)`;
  } else if (currentView === 'day') {
    lineLeft = `${GRID_CONSTANTS.DAY_TIME_COL_WIDTH}px`;
    lineWidth = `calc(100% - ${GRID_CONSTANTS.DAY_TIME_COL_WIDTH}px)`;
    currentDayIndex = 0;
  }

  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{ top: `${pixelsFromTop}px`, left: leftOffset, width }}
    >
      <div className="relative flex items-center">
        <div
          className="absolute z-40 flex items-center"
          style={{ left: lineLeft, transform: 'translateX(calc(-100%))' }}
        >
          <div className="flex h-5 items-center whitespace-nowrap rounded bg-destructive px-1.5 text-xs font-medium text-destructive-foreground shadow-md">
            {timeString}
          </div>
        </div>
        {currentView === 'week' && days ? (
          <>
            <div
              className="absolute h-0.5 bg-destructive opacity-30 shadow-sm"
              style={{
                left: `${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px`,
                width: `calc(100% - ${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px)`
              }}
            />
            {currentDayIndex >= 0 && (
              <div
                className="absolute h-0.5 bg-destructive opacity-100 shadow-sm"
                style={{
                  left: `calc(${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px + ${currentDayIndex} * (100% - ${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px) / 7)`,
                  width: `calc((100% - ${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px) / 7)`
                }}
              />
            )}
          </>
        ) : (
          <div
            className="absolute h-0.5 bg-destructive opacity-100 shadow-sm"
            style={{ left: lineLeft, width: lineWidth }}
          />
        )}
      </div>
    </div>
  );
};

const DraggableEventInner: React.FC<{
  event: CalendarEvent;
  style?: React.CSSProperties;
  className?: string;
  onClick?: (target: HTMLElement) => void;
  isPreview?: boolean;
  isDraft?: boolean;
  isActive?: boolean;
  currentDate?: Date;
  pixelsPerHour?: number;
  preference?: UserPreference;
}> = ({
  event,
  style,
  className,
  onClick,
  isPreview = false,
  isDraft = false,
  isActive = false,
  currentDate,
  pixelsPerHour,
  preference
}) => {
  const [hoveredHandle, setHoveredHandle] = useState<CalendarDragHandle | null>(null);
  const dateKey = currentDate ? format(currentDate, 'yyyy-MM-dd') : 'no-date';
  const isNewDraftEvent = event.id.startsWith('new-event-');
  const shouldDisableDrag = isPreview || isNewDraftEvent;
  const isPastEvent = isEventInPast(event);

  // Read draft changes to reflect updated title for drafts
  const { getEventDraftChanges } = useCalendar();
  const draftChanges = event?.id ? getEventDraftChanges?.(event.id) : undefined;
  const displayedTitle =
    (draftChanges?.title as string | undefined) ?? event.title ?? event.summary;

  // Get account-specific color
  const getAccountColor = (accountUid?: string): string => {
    if (!accountUid || !preference?.account?.accentColor) {
      return '#035ddf'; // Default blue
    }
    return preference.account.accentColor[accountUid] || '#035ddf';
  };

  const accountColor = getAccountColor(event.accountUid);
  const accountColorStyles = {
    '--account-color': accountColor,
    '--account-color-20': `${accountColor}20`,
    '--account-color-10': `${accountColor}10`,
    '--account-color-40': `${accountColor}40`,
    '--account-color-50': `${accountColor}50`,
    '--account-color-60': `${accountColor}60`
  } as React.CSSProperties;

  const moveDraggable = useDraggable({
    id: `event-move-${event.id}-${dateKey}`,
    data: { event, handle: 'move' },
    disabled: shouldDisableDrag
  });
  const startDraggable = useDraggable({
    id: `event-start-${event.id}-${dateKey}`,
    data: { event, handle: 'start' },
    disabled: shouldDisableDrag
  });
  const endDraggable = useDraggable({
    id: `event-end-${event.id}-${dateKey}`,
    data: { event, handle: 'end' },
    disabled: shouldDisableDrag
  });

  const isDragging =
    moveDraggable.isDragging || startDraggable.isDragging || endDraggable.isDragging;

  // Pick whichever drag handle is currently active to compute the transform
  const activeTransform =
    moveDraggable.transform || startDraggable.transform || endDraggable.transform;

  const eventStyle = {
    ...style,
    ...accountColorStyles,
    opacity: isDraft ? 0.6 : isDragging ? 0.4 : isPastEvent ? 0.5 : 1, // Reduce opacity for drafts, dragging, and past events
    pointerEvents: 'auto' as const, // Always allow pointer events for proper collision detection
    zIndex: isDragging ? 5 : 10 // Lower z-index when dragging to allow droppable areas to receive events
  };

  const { isAllDay } = getEventDateRange(event);
  const isTimedEvent = !isAllDay;

  // Determine if the signed-in user (Google marks as self: true) still needs to respond
  const needsActionForSelf: boolean = (() => {
    try {
      const attendees: Array<{ self?: boolean; responseStatus?: string }> =
        (event as unknown as { attendees?: Array<{ self?: boolean; responseStatus?: string }> })
          .attendees || [];
      const normalize = (s?: string) => (s ? s.toLowerCase().replace(/[^a-z]/g, '') : '');
      return attendees.some(
        (a) => (a?.self ?? false) && normalize(a?.responseStatus) === 'needsaction'
      );
    } catch {
      return false;
    }
  })();

  const isMultiDayEvent = (() => {
    try {
      const { start: s, end: e } = getEventDateRange(event);
      if (!s || !e) return false;
      return differenceInMinutes(e, s) > 1440;
    } catch {
      return false;
    }
  })();

  const getAvailableHandles = () => {
    if (!isTimedEvent || !currentDate)
      return {
        showStart: true,
        showEnd: true,
        continuesFromPrevious: false,
        continuesToNext: false
      };
    try {
      const { start: s, end: e } = getEventDateRange(event);
      if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime()))
        return {
          showStart: true,
          showEnd: true,
          continuesFromPrevious: false,
          continuesToNext: false
        };
      const dayStart = startOfDay(currentDate);
      const dayEnd = endOfDay(currentDate);
      const showStart = s >= dayStart && s <= dayEnd;
      const showEnd = e >= dayStart && e <= dayEnd;
      const continuesFromPrevious = s < dayStart;
      const continuesToNext = e > dayEnd;
      return { showStart, showEnd, continuesFromPrevious, continuesToNext };
    } catch {
      return {
        showStart: true,
        showEnd: true,
        continuesFromPrevious: false,
        continuesToNext: false
      };
    }
  };

  const { showStart, showEnd, continuesFromPrevious, continuesToNext } = getAvailableHandles();

  const getPreviewRange = () => {
    try {
      const { start: baseStart, end: baseEnd, isAllDay: allDay } = getEventDateRange(event);
      if (!baseStart || !baseEnd) return { start: baseStart, end: baseEnd };
      // If live preview is disabled or not a timed event, just return base range
      if (allDay || !pixelsPerHour) return { start: baseStart, end: baseEnd };
      const transformY = (activeTransform?.y || 0) as number;
      const deltaMinutesRaw = (transformY / pixelsPerHour) * 60;
      // snap to 15-minute increments to avoid odd durations while dragging
      const deltaMinutes = Math.round(deltaMinutesRaw / 15) * 15;
      if (moveDraggable.isDragging) {
        return {
          start: addMinutes(baseStart, deltaMinutes),
          end: addMinutes(baseEnd, deltaMinutes)
        };
      }
      if (startDraggable.isDragging) {
        const newStart = addMinutes(baseStart, deltaMinutes);
        const maxStart = new Date(baseEnd.getTime() - 15 * 60 * 1000);
        return {
          start: newStart > maxStart ? maxStart : newStart,
          end: baseEnd
        };
      }
      if (endDraggable.isDragging) {
        const newEnd = addMinutes(baseEnd, deltaMinutes);
        const minEnd = new Date(baseStart.getTime() + 15 * 60 * 1000);
        return {
          start: baseStart,
          end: newEnd > minEnd ? newEnd : minEnd
        };
      }
      return { start: baseStart, end: baseEnd };
    } catch {
      const { start: s, end: e } = getEventDateRange(event);
      return { start: s, end: e };
    }
  };

  return (
    <div
      data-event-id={event.id}
      data-dragging={isDragging}
      ref={shouldDisableDrag ? undefined : moveDraggable.setNodeRef}
      {...(shouldDisableDrag ? {} : moveDraggable.listeners)}
      {...(shouldDisableDrag ? {} : moveDraggable.attributes)}
      className={cn(
        'group relative cursor-pointer rounded-sm transition-colors',
        // Default left accent bar unless we render full dashed border for needs-action
        !isNewDraftEvent && !needsActionForSelf && 'border-l-4',
        isActive
          ? needsActionForSelf
            ? 'border border-dashed text-white'
            : 'text-white'
          : needsActionForSelf
            ? 'border border-dashed bg-transparent'
            : '',
        isDraft && !isActive && 'border-amber-400/50 bg-amber-100/20 ring-1 ring-amber-400/30',
        isDraft && isActive && 'text-amber-foreground border-amber-400 bg-amber-400',
        isDragging && 'opacity-40',
        isMultiDayEvent && !isActive && 'shadow-sm',
        isMultiDayEvent && isActive && 'shadow-md',
        'px-1 py-0.5 text-xs',
        className
      )}
      style={{
        ...eventStyle,
        // Use CSS custom properties for dynamic colors
        borderColor: isActive
          ? 'var(--account-color)'
          : needsActionForSelf
            ? 'var(--account-color)'
            : 'var(--account-color)',
        backgroundColor: isActive
          ? needsActionForSelf
            ? 'var(--account-color-20)'
            : 'var(--account-color)'
          : needsActionForSelf
            ? 'transparent'
            : isMultiDayEvent
              ? 'var(--account-color-10)'
              : 'var(--account-color-10)',
        ...(isMultiDayEvent &&
          !isActive && {
            background: `linear-gradient(to right, var(--account-color-20), var(--account-color-10), var(--account-color-20))`
          }),
        ...(needsActionForSelf &&
          !isActive && {
            ':hover': {
              backgroundColor: 'var(--account-color-20)'
            }
          }),
        ...(!needsActionForSelf &&
          !isActive && {
            ':hover': {
              backgroundColor: 'var(--account-color-20)'
            }
          })
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e.currentTarget as HTMLElement);
      }}
    >
      {isMultiDayEvent && continuesFromPrevious && (
        <div
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-sm"
          style={{ backgroundColor: 'var(--account-color-40)' }}
        />
      )}
      {isMultiDayEvent && continuesToNext && (
        <div
          className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-sm"
          style={{ backgroundColor: 'var(--account-color-40)' }}
        />
      )}
      <div
        className={cn(
          'relative z-10',
          shouldDisableDrag ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        )}
      >
        {(() => {
          try {
            const { isAllDay: allDay } = getEventDateRange(event);
            const eventHeight = style?.height
              ? parseInt(String(style.height).replace('px', ''))
              : 0;

            const useDoubleLineClamp = !allDay && eventHeight > 32;
            return (
              <div className={cn('flex flex-col', eventHeight === 100 && 'flex-row gap-2')}>
                <div
                  className={cn(
                    'text-xs font-medium',
                    useDoubleLineClamp ? 'line-clamp-2' : 'line-clamp-1'
                  )}
                >
                  {isDraft && (
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"
                      title="Draft changes pending"
                    />
                  )}
                  {isMultiDayEvent && !isDraft && (
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--account-color-60)' }}
                    />
                  )}
                  {displayedTitle}
                </div>
                {allDay
                  ? null
                  : (() => {
                      const { start: ps, end: pe } = getPreviewRange();
                      if (!ps || !pe || isNaN(ps.getTime()) || isNaN(pe.getTime())) {
                        return <div className="text-sm opacity-70">Time unavailable</div>;
                      }
                      return (
                        <div className="line-clamp-1 text-xs opacity-70">{`${format(ps, 'h:mm a')} - ${format(pe, 'h:mm a')}`}</div>
                      );
                    })()}
              </div>
            );
          } catch {
            return <div className="text-sm opacity-70">Time unavailable</div>;
          }
        })()}
      </div>
      {isTimedEvent && !shouldDisableDrag && showStart && (
        <div
          ref={startDraggable.setNodeRef}
          {...startDraggable.attributes}
          {...startDraggable.listeners}
          className={cn(
            'absolute -top-1 left-0 right-0 z-30 h-2 cursor-ns-resize rounded-sm opacity-0 transition-all group-hover:opacity-100',
            hoveredHandle === 'start' && 'bg-blue-400/30',
            startDraggable.isDragging && 'h-3 bg-blue-400/40 opacity-100'
          )}
          onMouseEnter={() => setHoveredHandle('start')}
          onMouseLeave={() => setHoveredHandle(null)}
        />
      )}
      {isTimedEvent && !shouldDisableDrag && showEnd && (
        <div
          ref={endDraggable.setNodeRef}
          {...endDraggable.attributes}
          {...endDraggable.listeners}
          className={cn(
            'absolute -bottom-1 left-0 right-0 z-30 h-2 cursor-ns-resize rounded-sm opacity-0 transition-all group-hover:opacity-100',
            hoveredHandle === 'end' && 'bg-blue-400/30',
            endDraggable.isDragging && 'h-3 bg-blue-400/40 opacity-100'
          )}
          onMouseEnter={() => setHoveredHandle('end')}
          onMouseLeave={() => setHoveredHandle(null)}
        />
      )}
      {isTimedEvent && !shouldDisableDrag && (
        <>
          {showStart && (
            <div
              className={cn(
                'absolute -top-0.5 left-1/2 z-20 h-1 w-8 -translate-x-1/2 rounded-full transition-all',
                startDraggable.isDragging
                  ? 'h-1.5 w-12 bg-blue-400 opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
              style={
                !startDraggable.isDragging
                  ? { backgroundColor: 'var(--account-color-50)' }
                  : undefined
              }
            />
          )}
          {showEnd && (
            <div
              className={cn(
                'absolute -bottom-0.5 left-1/2 z-20 h-1 w-8 -translate-x-1/2 rounded-full transition-all',
                endDraggable.isDragging
                  ? 'h-1.5 w-12 bg-blue-400 opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
              style={
                !endDraggable.isDragging
                  ? { backgroundColor: 'var(--account-color-50)' }
                  : undefined
              }
            />
          )}
        </>
      )}
    </div>
  );
};

export const DraggableEvent = React.memo(DraggableEventInner, (prev, next) => {
  // Avoid rerenders unless relevant props actually change
  const shallowEq = (a: unknown, b: unknown) => a === b;
  return (
    prev.isPreview === next.isPreview &&
    prev.isDraft === next.isDraft &&
    prev.isActive === next.isActive &&
    shallowEq(prev.className, next.className) &&
    shallowEq(prev.pixelsPerHour, next.pixelsPerHour) &&
    // Compare account UID for color changes
    prev.event.accountUid === next.event.accountUid &&
    // Compare relevant preference fields for color changes
    prev.preference?.account?.accentColor?.[prev.event.accountUid || ''] ===
      next.preference?.account?.accentColor?.[next.event.accountUid || ''] &&
    // Event object: use id and relevant time fields as a cheap change detector
    prev.event.id === next.event.id &&
    // Title changes should trigger re-render - check both title and summary fields
    prev.event.title === next.event.title &&
    prev.event.summary === next.event.summary &&
    // Check start time - for all-day events use date, for timed events use dateTime
    (prev.event.allDay ? prev.event.start?.date : prev.event.start?.dateTime) ===
      (next.event.allDay ? next.event.start?.date : next.event.start?.dateTime) &&
    // Check end time - for all-day events use date, for timed events use dateTime
    (prev.event.allDay ? prev.event.end?.date : prev.event.end?.dateTime) ===
      (next.event.allDay ? next.event.end?.date : next.event.end?.dateTime)
  );
});

const DroppableTimeSlotInner: React.FC<{
  id: string;
  date: Date;
  hour?: number;
  minute?: number;
  children?: React.ReactNode;
  className?: string;
  onCreateEvent?: (
    date: Date,
    hour?: number,
    minute?: number,
    anchor?:
      | { clientX: number; clientY: number }
      | { rect: { left: number; top: number; width: number; height: number } }
  ) => void;
  onDragSelectionStart?: (
    date: Date,
    hour?: number,
    minute?: number,
    slotId?: string,
    mouseX?: number,
    mouseY?: number
  ) => void;
  onDragSelectionChange?: (date: Date, hour?: number, minute?: number, slotId?: string) => void;
  onDragSelectionEnd?: (date: Date, hour?: number, minute?: number, slotId?: string) => void;
  onClearSelection?: () => void;
  isDragSelecting?: boolean;
  allowDoubleClickCreate?: boolean;
  style?: React.CSSProperties;
}> = ({
  id,
  date,
  hour,
  minute,
  children,
  className,
  onCreateEvent,
  onDragSelectionStart,
  onDragSelectionChange,
  onDragSelectionEnd,
  onClearSelection,
  isDragSelecting,
  allowDoubleClickCreate = true,
  style
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  const handleClick = () => {
    if (onClearSelection && !isDragSelecting) {
      setTimeout(() => onClearSelection(), 200);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (onCreateEvent && !isDragSelecting && allowDoubleClickCreate) {
      e.stopPropagation();
      let eventDate = date;
      if (hour !== undefined) {
        eventDate = addHours(startOfDay(date), hour);
        if (minute !== undefined) eventDate = addMinutes(eventDate, minute);
      }
      onCreateEvent(eventDate, hour, minute, { clientX: e.clientX, clientY: e.clientY });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.button === 0 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      onDragSelectionStart &&
      !isDragSelecting
    ) {
      e.preventDefault();
      e.stopPropagation();
      onDragSelectionStart(date, hour, minute, id, e.clientX, e.clientY);
    }
  };

  const handleMouseEnter = () => {
    if (isDragSelecting && onDragSelectionChange) {
      onDragSelectionChange(date, hour, minute, id);
    }
  };

  const handleMouseUp = () => {
    if (isDragSelecting && onDragSelectionEnd) {
      onDragSelectionEnd(date, hour, minute, id);
    }
  };

  return (
    <div
      data-id={id}
      data-slot-date={date.toISOString()}
      data-slot-hour={hour}
      data-slot-minute={minute}
      ref={setNodeRef}
      className={cn(
        'relative z-10 min-h-[15px] select-none transition-colors',
        isOver && 'bg-primary/10',
        className
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseUp={handleMouseUp}
      style={style}
    >
      {children}
    </div>
  );
};

export const DroppableTimeSlot = React.memo(DroppableTimeSlotInner, (prev, next) => {
  // Only rerender when identity or interaction-relevant props change
  return (
    prev.id === next.id &&
    prev.isDragSelecting === next.isDragSelecting &&
    prev.className === next.className &&
    prev.style === next.style &&
    prev.hour === next.hour &&
    prev.minute === next.minute &&
    prev.date.getTime() === next.date.getTime()
  );
});

export const DragSelectionOverlay: React.FC<{
  selection: CalendarDragSelection | null;
  currentView: CalendarView;
  viewStartDate?: Date;
  days?: Date[];
}> = ({ selection, currentView, days }) => {
  if (!selection) return null;

  const calculateSelectionBounds = () => {
    if (currentView === 'week') {
      if (!days) return null;
      const startDayIndex = days.findIndex((day) => isSameDay(day, selection.startDate));
      const endDayIndex = days.findIndex((day) => isSameDay(day, selection.endDate));
      if (startDayIndex === -1 || endDayIndex === -1) return null;
      const dragStartDay = startDayIndex;
      const dragEndDay = endDayIndex;
      const startMinutes = (selection.startHour || 0) * 60 + (selection.startMinute || 0);
      const endMinutes = (selection.endHour || 0) * 60 + (selection.endMinute || 0);
      const dragStartMinutes = startMinutes;
      const dragEndMinutes = endMinutes;
      const selectionBlocks: Array<{ dayIndex: number; startMinutes: number; endMinutes: number }> =
        [];
      const actualStartDay = Math.min(dragStartDay, dragEndDay);
      const actualEndDay = Math.max(dragStartDay, dragEndDay);
      const actualStartMinutes = dragStartDay <= dragEndDay ? dragStartMinutes : dragEndMinutes;
      const actualEndMinutes = dragStartDay <= dragEndDay ? dragEndMinutes : dragStartMinutes;
      if (actualStartDay === actualEndDay) {
        const dayStartMinutes = Math.min(actualStartMinutes, actualEndMinutes);
        const dayEndMinutes = Math.max(actualStartMinutes, actualEndMinutes);
        selectionBlocks.push({
          dayIndex: actualStartDay,
          startMinutes: dayStartMinutes,
          endMinutes: dayEndMinutes
        });
      } else {
        for (let dayIndex = actualStartDay; dayIndex <= actualEndDay; dayIndex++) {
          let dayStartMinutes: number;
          let dayEndMinutes: number;
          if (dayIndex === actualStartDay) {
            dayStartMinutes = actualStartMinutes;
            dayEndMinutes = 24 * 60;
          } else if (dayIndex === actualEndDay) {
            dayStartMinutes = 0;
            dayEndMinutes = actualEndMinutes;
          } else {
            dayStartMinutes = 0;
            dayEndMinutes = 24 * 60;
          }
          selectionBlocks.push({
            dayIndex,
            startMinutes: dayStartMinutes,
            endMinutes: dayEndMinutes
          });
        }
      }
      return { selectionBlocks };
    } else if (currentView === 'day') {
      const startMinutes = (selection.startHour || 0) * 60 + (selection.startMinute || 0);
      const endMinutes = (selection.endHour || 0) * 60 + (selection.endMinute || 0);
      const actualStartMinutes = Math.min(startMinutes, endMinutes);
      const actualEndMinutes = Math.max(startMinutes, endMinutes);
      return {
        left: `${GRID_CONSTANTS.DAY_TIME_COL_WIDTH}px`,
        width: `calc(100% - ${GRID_CONSTANTS.DAY_TIME_COL_WIDTH}px)`,
        top: `${(actualStartMinutes / 60) * GRID_CONSTANTS.DAY_PIXELS_PER_HOUR}px`,
        height: `${((actualEndMinutes - actualStartMinutes) / 60) * GRID_CONSTANTS.DAY_PIXELS_PER_HOUR}px`
      };
    }
    return null;
  };

  const bounds = calculateSelectionBounds();
  if (!bounds) return null;
  if (
    currentView === 'week' &&
    typeof bounds === 'object' &&
    bounds !== null &&
    'selectionBlocks' in bounds &&
    Array.isArray((bounds as unknown as { selectionBlocks: unknown }).selectionBlocks)
  ) {
    const selectionBlocks = (
      bounds as unknown as {
        selectionBlocks: Array<{
          dayIndex: number;
          startMinutes: number;
          endMinutes: number;
        }>;
      }
    ).selectionBlocks;
    return (
      <>
        {selectionBlocks.map(({ dayIndex, startMinutes, endMinutes }, index) => {
          const left = `calc(${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px + ${dayIndex} * (100% - ${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px) / 7)`;
          const width = `calc((100% - ${GRID_CONSTANTS.WEEK_TIME_COL_WIDTH}px) / 7)`;
          const top = `${(startMinutes / 60) * GRID_CONSTANTS.WEEK_PIXELS_PER_HOUR}px`;
          const height = `${((endMinutes - startMinutes) / 60) * GRID_CONSTANTS.WEEK_PIXELS_PER_HOUR}px`;
          return (
            <div
              key={`selection-block-${index}`}
              className="pointer-events-none absolute z-20 bg-primary/20"
              style={{ left, width, top, height }}
            />
          );
        })}
      </>
    );
  }
  return (
    <div
      className="pointer-events-none absolute z-20 bg-primary/20"
      style={bounds as React.CSSProperties}
    />
  );
};
