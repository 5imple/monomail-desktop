import { isToday } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export const formatDate = (
  timestamp: number,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): string => {
  const date = toZonedTime(new Date(timestamp), timeZone);

  const now = toZonedTime(new Date(), timeZone);
  const formatString =
    date.getFullYear() === now.getFullYear() ? `eee, MMM d 'at' h:mma` : `MMM d, yyyy 'at' h:mma`;
  const formattedDate = formatInTimeZone(date, timeZone, formatString);

  return formattedDate;
};

/**
 * Message header date in the reader: "Fri, Oct 2" — plus the time for today's
 * mail ("3:01 PM", like the inbox list) and the year for older years, so a
 * thread's messages don't all read the same.
 */
export const formatMessageCardDate = (
  timestamp: number,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): string => {
  const date = toZonedTime(new Date(timestamp), timeZone);
  const now = toZonedTime(new Date(), timeZone);

  if (isToday(date)) return formatInTimeZone(date, timeZone, 'h:mm a');
  if (date.getFullYear() !== now.getFullYear()) {
    return formatInTimeZone(date, timeZone, 'eee, MMM d, yyyy');
  }
  return formatInTimeZone(date, timeZone, 'eee, MMM d');
};

export const formatFullDateTime = (
  timestamp: number,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): string => {
  const date = toZonedTime(new Date(timestamp), timeZone);

  return formatInTimeZone(date, timeZone, "eee, MMM d, yyyy 'at' h:mm a");
};

// The list formats a date per row per render. Resolving the time zone
// (Intl.DateTimeFormat().resolvedOptions()) and formatting through date-fns-tz
// each time added up over a hundred rows; the zone is re-read at most once a
// minute and each (timestamp, zone, day) is formatted once.
let zoneCache = { zone: '', readAt: 0 };
const localTimeZone = (): string => {
  const now = Date.now();
  if (!zoneCache.zone || now - zoneCache.readAt > 60_000) {
    zoneCache = { zone: Intl.DateTimeFormat().resolvedOptions().timeZone, readAt: now };
  }
  return zoneCache.zone;
};
const listDateCache = new Map<string, string>();
const LIST_DATE_CACHE_LIMIT = 4000;

export const formatListDate = (timestamp: number, timeZone: string = localTimeZone()): string => {
  // "Today" decides the format, so the day is part of the key.
  const key = `${timestamp}|${timeZone}|${new Date().toDateString()}`;
  const cached = listDateCache.get(key);
  if (cached !== undefined) return cached;
  const formatted = formatListDateUncached(timestamp, timeZone);
  if (listDateCache.size >= LIST_DATE_CACHE_LIMIT) listDateCache.clear();
  listDateCache.set(key, formatted);
  return formatted;
};

const formatListDateUncached = (timestamp: number, timeZone: string): string => {
  const dt = toZonedTime(new Date(timestamp), timeZone);
  const now = toZonedTime(new Date(), timeZone);

  if (isToday(dt)) {
    return formatInTimeZone(dt, timeZone, 'h:mm a');
  } else if (dt.getFullYear() !== now.getFullYear()) {
    return formatInTimeZone(dt, timeZone, 'MMM d, yyyy');
  } else {
    return formatInTimeZone(dt, timeZone, 'MMM d');
  }
};

export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''} ago`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};
