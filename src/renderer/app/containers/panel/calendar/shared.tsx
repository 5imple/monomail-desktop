import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatTimeRange, getEventDateRange, isEventInPast } from './utils';
import { readableTextOn } from './eventText';

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
          <div className="flex h-5 items-center whitespace-nowrap rounded-md bg-destructive px-1.5 text-xs font-medium text-destructive-foreground shadow-md dark:text-background">
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

// The account's accent color (Settings › Accounts), or the default blue.
export const DEFAULT_EVENT_COLOR = '#035ddf';
export const getAccountColor = (preference?: UserPreference, accountUid?: string | null): string =>
  (accountUid && preference?.account?.accentColor?.[accountUid]) || DEFAULT_EVENT_COLOR;

const tint = (color: string) => `linear-gradient(${color}, ${color})`;

// Title clamp by block height (text-xs lines are 16px; 4px padding plus the
// time line below). Literal classes so Tailwind generates them.
const TITLE_LINE_CLAMP = [
  'line-clamp-1',
  'line-clamp-2',
  'line-clamp-3',
  'line-clamp-4',
  'line-clamp-5',
  'line-clamp-6'
];

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
  // Rendered height of a timed block; all-day chips leave it unset.
  heightPx?: number;
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
  heightPx,
  preference
}) => {
  const [hoveredHandle, setHoveredHandle] = useState<CalendarDragHandle | null>(null);
  const dateKey = currentDate ? format(currentDate, 'yyyy-MM-dd') : 'no-date';
  const isNewDraftEvent = event.id.startsWith('new-event-');
  const shouldDisableDrag = isPreview || isNewDraftEvent;
  const isPastEvent = isEventInPast(event);

  // Read draft changes to reflect updated title for drafts
  const { t } = useTranslation();
  const { getEventDraftChanges } = useCalendar();
  const draftChanges = event?.id ? getEventDraftChanges?.(event.id) : undefined;
  const displayedTitle =
    (draftChanges?.title as string | undefined) ?? event.title ?? event.summary;
  const title = displayedTitle?.trim() ? displayedTitle : null;

  const accountColor = getAccountColor(preference, event.accountUid);
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

  const timeText = (() => {
    if (isAllDay) return null;
    const { start: ps, end: pe } = getPreviewRange();
    if (!ps || !pe || isNaN(ps.getTime()) || isNaN(pe.getTime())) return 'Time unavailable';
    return formatTimeRange(ps, pe);
  })();

  // Fills paint over an opaque card base, so hour lines and the slot hover no
  // longer show through (a bare 6% tint left only the colored bar on dark
  // themes). The layers are CSS variables so a class can swap them on hover;
  // inline background colors used to override every hover and draft style.
  const solidFill = isActive && !needsActionForSelf;
  const fillRest = isDraft
    ? tint('hsl(var(--secondary-accent) / 0.15)')
    : needsActionForSelf
      ? isActive
        ? tint('var(--account-color-40)')
        : 'none'
      : isMultiDayEvent
        ? 'linear-gradient(to right, var(--account-color-20), var(--account-color-10), var(--account-color-20))'
        : tint('var(--account-color-20)');
  const fillHover = isDraft
    ? tint('hsl(var(--secondary-accent) / 0.25)')
    : tint('var(--account-color-40)');

  const titleContent = (
    <>
      {isDraft && (
        <span
          className="mr-1 inline-block h-2 w-2 rounded-full bg-secondary-accent"
          title={t('calendar.draft_pending')}
        />
      )}
      {isMultiDayEvent && !isDraft && (
        <span
          className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'var(--account-color-60)' }}
        />
      )}
      {title ?? (
        <span className={isActive ? 'opacity-80' : 'text-muted-foreground'}>(No title)</span>
      )}
    </>
  );

  const compact = heightPx !== undefined && heightPx < 36;
  const titleLines =
    heightPx === undefined ? 1 : Math.min(6, Math.max(1, Math.floor((heightPx - 20) / 16)));

  return (
    <div
      data-event-id={event.id}
      data-dragging={isDragging}
      ref={shouldDisableDrag ? undefined : moveDraggable.setNodeRef}
      {...(shouldDisableDrag ? {} : moveDraggable.listeners)}
      {...(shouldDisableDrag ? {} : moveDraggable.attributes)}
      aria-label={`${title ?? '(No title)'}, ${timeText ?? 'All-day'}`}
      className={cn(
        'group relative cursor-pointer rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Default left accent bar unless we render full dashed border for needs-action
        !isNewDraftEvent && !needsActionForSelf && 'border-l-4',
        needsActionForSelf && 'border border-dashed',
        !solidFill && 'bg-card [background-image:var(--event-fill)]',
        !solidFill && !isDragging && 'hover:[background-image:var(--event-fill-hover)]',
        isDraft && !isActive && 'ring-1 ring-secondary-accent/40',
        isDragging && 'opacity-40',
        isMultiDayEvent && !isActive && 'shadow-sm',
        isMultiDayEvent && isActive && 'shadow-md',
        'px-1 py-0.5 text-xs',
        className
      )}
      style={
        {
          ...eventStyle,
          borderColor:
            isDraft && !isActive ? 'hsl(var(--secondary-accent))' : 'var(--account-color)',
          ...(solidFill
            ? { backgroundColor: 'var(--account-color)', color: readableTextOn(accountColor) }
            : { '--event-fill': fillRest, '--event-fill-hover': fillHover })
        } as React.CSSProperties
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e.currentTarget as HTMLElement);
      }}
      onKeyDown={(e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick?.(e.currentTarget as HTMLElement);
          return;
        }
        // Keys on a focused event belong to the calendar: Backspace, E, U…
        // used to reach the inbox hotkeys and act on the open email.
        if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
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
      {/* Clipped here, not on the root: the resize strips and grab pills sit
          partly outside the block. */}
      <div
        className={cn(
          'relative z-10 h-full min-h-0 overflow-hidden',
          shouldDisableDrag ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        )}
      >
        {isAllDay || heightPx === undefined ? (
          <div className="flex flex-col">
            <div className="line-clamp-1 text-xs font-medium">{titleContent}</div>
            {timeText && <div className="line-clamp-1 text-xs opacity-70">{timeText}</div>}
          </div>
        ) : compact ? (
          // Too short for two lines: title and time share one row.
          <div className="flex min-w-0 items-baseline gap-1">
            <div className="min-w-0 truncate text-xs font-medium">{titleContent}</div>
            <div className="shrink-0 text-xs opacity-70">{timeText}</div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className={cn('text-xs font-medium', TITLE_LINE_CLAMP[titleLines - 1])}>
              {titleContent}
            </div>
            <div className="line-clamp-1 text-xs opacity-70">{timeText}</div>
          </div>
        )}
      </div>
      {isTimedEvent && !shouldDisableDrag && showStart && (
        <div
          ref={startDraggable.setNodeRef}
          {...startDraggable.attributes}
          {...startDraggable.listeners}
          // Pointer-only resize strips: not a tab stop or a nameless button.
          tabIndex={-1}
          aria-hidden
          className={cn(
            'absolute -top-1 left-0 right-0 z-30 h-2 cursor-ns-resize rounded-sm opacity-0 transition-all group-hover:opacity-100',
            hoveredHandle === 'start' && 'bg-[color:var(--account-color-40)]',
            startDraggable.isDragging && 'h-3 bg-[color:var(--account-color-50)] opacity-100'
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
          tabIndex={-1}
          aria-hidden
          className={cn(
            'absolute -bottom-1 left-0 right-0 z-30 h-2 cursor-ns-resize rounded-sm opacity-0 transition-all group-hover:opacity-100',
            hoveredHandle === 'end' && 'bg-[color:var(--account-color-40)]',
            endDraggable.isDragging && 'h-3 bg-[color:var(--account-color-50)] opacity-100'
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
                  ? 'h-1.5 w-12 bg-[color:var(--account-color)] opacity-100'
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
                  ? 'h-1.5 w-12 bg-[color:var(--account-color)] opacity-100'
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
    prev.heightPx === next.heightPx &&
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

// The block a new event occupies while it's being drag-selected and while its
// editor is open, styled like an event of the account it will be created in.
export const PendingEventBlock = React.forwardRef<
  HTMLDivElement,
  { start: Date; end: Date; color: string; className?: string; style?: React.CSSProperties }
>(({ start, end, color, className, style }, ref) => (
  <div
    ref={ref}
    data-calendar-pending-event="true"
    className={cn(
      'overflow-hidden rounded-sm border-l-4 bg-card px-1 py-0.5 text-xs shadow-sm',
      className
    )}
    style={{ borderColor: color, backgroundImage: tint(`${color}33`), ...style }}
  >
    <div className="truncate font-medium text-muted-foreground">(No title)</div>
    <div className="truncate opacity-70">{formatTimeRange(start, end)}</div>
  </div>
));
PendingEventBlock.displayName = 'PendingEventBlock';

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

  // A single click clears the selection after a beat. A double-click's clicks
  // must not: the clear landed ~200 ms after the new-event editor opened and
  // closed it again.
  const clearTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clearTimerRef.current), []);

  const handleClick = (e: React.MouseEvent) => {
    if (e.detail > 1) return;
    if (onClearSelection && !isDragSelecting) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = window.setTimeout(() => onClearSelection(), 200);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    window.clearTimeout(clearTimerRef.current);
    if (onCreateEvent && !isDragSelecting && allowDoubleClickCreate) {
      e.stopPropagation();
      let eventDate = date;
      if (hour !== undefined) {
        eventDate = addHours(startOfDay(date), hour);
        if (minute !== undefined) eventDate = addMinutes(eventDate, minute);
      }
      // Anchored at the column's edge, so the editor opens beside the slot
      // rather than over the time just clicked.
      const slotLeft = (e.currentTarget as HTMLElement).getBoundingClientRect().left;
      onCreateEvent(eventDate, hour, minute, { clientX: slotLeft, clientY: e.clientY });
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
  accentColor?: string;
}> = ({ selection, currentView, days, accentColor }) => {
  if (!selection) return null;

  if (currentView === 'day') {
    const startMinutes = (selection.startHour || 0) * 60 + (selection.startMinute || 0);
    const endMinutes = (selection.endHour || 0) * 60 + (selection.endMinute || 0);
    // A press that hasn't left its slot is still a click, not a selection.
    if (startMinutes === endMinutes) return null;
    // The range includes the slot under the cursor, in either drag direction
    // (as onDragSelectionEnd creates it), so it no longer stops one slot short.
    const rangeStart = Math.min(startMinutes, endMinutes);
    const rangeEnd =
      Math.max(startMinutes, endMinutes) + (selection.startHour !== undefined ? 15 : 0);
    const dayStart = startOfDay(selection.startDate);
    return (
      <PendingEventBlock
        start={addMinutes(dayStart, rangeStart)}
        end={addMinutes(dayStart, rangeEnd)}
        color={accentColor ?? DEFAULT_EVENT_COLOR}
        className="pointer-events-none absolute z-20"
        style={{
          left: `${GRID_CONSTANTS.DAY_TIME_COL_WIDTH}px`,
          width: `calc(100% - ${GRID_CONSTANTS.DAY_TIME_COL_WIDTH}px)`,
          top: `${(rangeStart / 60) * GRID_CONSTANTS.DAY_PIXELS_PER_HOUR}px`,
          height: `${((rangeEnd - rangeStart) / 60) * GRID_CONSTANTS.DAY_PIXELS_PER_HOUR}px`
        }}
      />
    );
  }

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
  return null;
};
