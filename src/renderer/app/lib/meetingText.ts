// Text for a meeting carried by an email (MeetingCard): when it is, in the
// viewer's locale and time zone, in as few words as the span allows.

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const parse = (iso: string | null): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export interface MeetingWhen {
  // "Tuesday, October 27" (with the year when it is not this year)
  date: string;
  // "3:00 – 3:30 PM", "All day", or "" when unknown; a multi-day span puts the
  // end date here ("3:00 PM – Wed, Oct 28, 9:00 AM").
  time: string;
}

/**
 * The lines the card shows for a meeting's span. `allDayLabel` is the caller's
 * translated "All day". All-day events from Graph end at midnight after the
 * last day, which is shown as that last day.
 */
export function formatMeetingWhen(
  start: string | null,
  end: string | null,
  isAllDay: boolean,
  allDayLabel: string,
  locale?: string,
  now: Date = new Date()
): MeetingWhen | null {
  const from = parse(start);
  if (!from) return null;
  let to = parse(end);

  const withYear = (date: Date) => date.getFullYear() !== now.getFullYear();
  const longDate = (date: Date) =>
    date.toLocaleDateString(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      ...(withYear(date) ? { year: 'numeric' } : {})
    });
  const shortDate = (date: Date) =>
    date.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(withYear(date) ? { year: 'numeric' } : {})
    });
  const clock = (date: Date) =>
    date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  if (isAllDay) {
    // Exclusive end (midnight after the last day) → inclusive last day.
    if (to) to = new Date(to.getTime() - 1);
    if (!to || sameDay(from, to) || to < from) return { date: longDate(from), time: allDayLabel };
    return { date: `${longDate(from)} – ${shortDate(to)}`, time: allDayLabel };
  }

  if (!to || to <= from) return { date: longDate(from), time: clock(from) };
  if (sameDay(from, to)) return { date: longDate(from), time: `${clock(from)} – ${clock(to)}` };
  return { date: longDate(from), time: `${clock(from)} – ${shortDate(to)}, ${clock(to)}` };
}

/** A person's display text: their name, else the part of the address before @. */
export const personLabel = (person: { name?: string; email: string }): string =>
  person.name?.trim() || person.email.split('@')[0] || person.email;
