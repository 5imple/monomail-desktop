import { differenceInMinutes, endOfDay, startOfDay } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { CalendarEvent } from '@/renderer/app/store/calendar/calendarAtoms';

// Helper function to safely parse event dates
export const parseEventDate = (dateValue: unknown): Date | null => {
  if (!dateValue) return null;
  try {
    if (typeof dateValue === 'string') {
      // Check if it's a date-only string (YYYY-MM-DD format for all-day events)
      const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateOnlyRegex.test(dateValue)) {
        // For date-only strings, parse as local date to avoid timezone conversion
        const [year, month, day] = dateValue.split('-').map(Number);
        return new Date(year, month - 1, day); // month is 0-indexed
      }
      // For datetime strings, use regular parsing
      const d = new Date(dateValue);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof dateValue === 'number') {
      const d = new Date(dateValue);
      return isNaN(d.getTime()) ? null : d;
    }
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? null : dateValue;
    }
    if (
      typeof dateValue === 'object' &&
      dateValue !== null &&
      'value' in (dateValue as Record<string, unknown>) &&
      (typeof (dateValue as { value: unknown }).value === 'string' ||
        typeof (dateValue as { value: unknown }).value === 'number')
    ) {
      const obj = dateValue as { value: string | number; dateOnly?: boolean };
      const v = obj.value;

      // For all-day events (dateOnly: true), parse as UTC date without timezone conversion
      if (obj.dateOnly === true && typeof v === 'number') {
        const utcDate = new Date(v);
        // Extract the UTC date components and create a local date to avoid timezone shift
        const year = utcDate.getUTCFullYear();
        const month = utcDate.getUTCMonth();
        const day = utcDate.getUTCDate();
        return new Date(year, month, day);
      }

      if (typeof v === 'string') {
        // Apply same date-only logic for timestamp objects
        const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (dateOnlyRegex.test(v)) {
          const [year, month, day] = v.split('-').map(Number);
          return new Date(year, month - 1, day);
        }
      }
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Helper function to get event start and end dates with better error handling
export const getEventDateRange = (
  event: CalendarEvent,
  _timeZone?: string
): { start: Date | null; end: Date | null; isAllDay: boolean } => {
  // Mark optional param as used to satisfy linter while keeping API parity
  void _timeZone;
  let eventStart: Date | null = null;
  let eventEnd: Date | null = null;

  // Prioritize the allDay property from draft changes over data structure detection
  // This ensures draft changes to allDay status are immediately reflected
  const isAllDay = event.allDay || false;

  if (isAllDay) {
    // All-day event: use date fields if available, fallback to dateTime
    eventStart = parseEventDate(event.start.date) || parseEventDate(event.start.dateTime);
    eventEnd = parseEventDate(event.end.date) || parseEventDate(event.end.dateTime);
    // For all-day events, keep the dates as-is for display purposes
    // The eventSpansDay function handles the exclusive end date logic
    if (eventStart) eventStart = startOfDay(eventStart);
    if (eventEnd) eventEnd = endOfDay(eventEnd);
  } else {
    // Timed event: use dateTime fields
    eventStart = parseEventDate(event.start.dateTime);
    eventEnd = parseEventDate(event.end.dateTime);
  }

  return { start: eventStart, end: eventEnd, isAllDay };
};

// Helper function to check if an event spans through a specific day
export const eventSpansDay = (event: CalendarEvent, date: Date, timeZone?: string): boolean => {
  try {
    const tz =
      timeZone ||
      event.start.timeZone ||
      event.end.timeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone;

    // For all-day events, use date fields if available
    if (
      event.allDay &&
      (event.start.date ||
        (event.start.date &&
          typeof event.start.date === 'object' &&
          'value' in event.start.date)) &&
      (event.end.date ||
        (event.end.date && typeof event.end.date === 'object' && 'value' in event.end.date))
    ) {
      const targetDay = date.toISOString().split('T')[0];
      // Google all-day end.date is exclusive
      const startDate =
        typeof event.start.date === 'string'
          ? event.start.date
          : event.start.date?.value
            ? new Date(event.start.date.value).toISOString().split('T')[0]
            : null;
      const endDate =
        typeof event.end.date === 'string'
          ? event.end.date
          : event.end.date?.value
            ? new Date(event.end.date.value).toISOString().split('T')[0]
            : null;

      return Boolean(startDate && endDate && targetDay >= startDate && targetDay < endDate);
    }

    // For timed events, use dateTime fields (ignore date fields when allDay is false)
    const startDateTime = event.start.dateTime;
    const endDateTime = event.end.dateTime;

    if (startDateTime && endDateTime) {
      const targetDay = formatInTimeZone(date, tz, 'yyyy-MM-dd');
      const startStr = formatInTimeZone(new Date(startDateTime), tz, 'yyyy-MM-dd');
      const endStr = formatInTimeZone(new Date(endDateTime), tz, 'yyyy-MM-dd');
      // Treat timed event end as exclusive
      return targetDay >= startStr && targetDay <= endStr;
    }

    // Fallback: use getEventDateRange for complex cases
    const { start: eventStart, end: eventEnd } = getEventDateRange(event, tz);
    if (!eventStart || !eventEnd) return false;
    if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) return false;

    // Compute the selected day bounds in UTC for the given timezone
    const dayString = formatInTimeZone(date, tz, 'yyyy-MM-dd');
    const dayStartUtc = fromZonedTime(new Date(`${dayString}T00:00:00.000`), tz);
    const dayEndUtc = fromZonedTime(new Date(`${dayString}T23:59:59.999`), tz);
    // Treat timed event end as exclusive at day start to avoid showing
    // events that end exactly at 00:00 on the next day
    const spans = eventStart <= dayEndUtc && eventEnd > dayStartUtc;

    return spans;
  } catch (error) {
    console.error('eventSpansDay error for event:', event.id, error);
    return false;
  }
};

// Helper function to determine if an event is all-day based on API response
export const isAllDayFromApiResponse = (
  start: { date?: string | { value: number } | null; dateTime?: string | null },
  end: { date?: string | { value: number } | null; dateTime?: string | null }
): boolean => {
  // If we have date fields, it's definitely all-day
  if (start.date && end.date) {
    return true;
  }

  // If we have dateTime fields, check if they're at 00:00:00 (start of day)
  if (start.dateTime && end.dateTime) {
    const startTime = new Date(start.dateTime);
    const endTime = new Date(end.dateTime);

    // Check if both start and end times are at 00:00:00 (start of day)
    const isStartAtMidnight =
      startTime.getHours() === 0 && startTime.getMinutes() === 0 && startTime.getSeconds() === 0;
    const isEndAtMidnight =
      endTime.getHours() === 0 && endTime.getMinutes() === 0 && endTime.getSeconds() === 0;

    return isStartAtMidnight && isEndAtMidnight;
  }

  return false;
};

// Helper function to check if an event is in the past
export const isEventInPast = (event: CalendarEvent): boolean => {
  try {
    const { end: eventEnd } = getEventDateRange(event);
    if (!eventEnd || isNaN(eventEnd.getTime())) return false;
    const now = new Date();
    return eventEnd < now;
  } catch (error) {
    return false;
  }
};
