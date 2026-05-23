import { format, isToday, isYesterday } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

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

export const formatListDate = (
  timestamp: number,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): string => {
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
