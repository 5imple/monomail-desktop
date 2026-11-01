import dayjs from 'dayjs';
import * as chrono from 'chrono-node';

export type Suggestion = {
  label: string;
  /**
   * Text chrono re-parses to `date`. Absolute rows spell out the full date
   * ("November 6 2026 at 9:00am") so they mean the same thing whenever they're
   * picked; relative rows ("in 2 hours") re-anchor to the moment they're picked.
   * Unique per list, so it's also the row's React key and cmdk value.
   */
  value: string;
  /** When the email comes back, resolved against the `now` the list was built for. */
  date: Date;
  type?: 'relative' | 'absolute';
};

const MAX_RESULTS = 6;
// A day typed without a time ("tomorrow", "friday") means its first slot still
// ahead: 9 AM, then 2 PM (and 6 PM, which only matters for "today").
const DAY_SLOT_HOURS = [9, 14, 18];
const SLOTS_PER_DAY = 2;
const PARSE_OPTIONS = { forwardDate: true };

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
];

// Words that complete as you type them: "t" / "tom" → Tomorrow, "fr" → Friday.
// `min` is how many letters it takes before the word is offered.
const PREFIX_PHRASES: { phrase: string; min: number }[] = [
  { phrase: 'tomorrow', min: 1 },
  { phrase: 'today', min: 2 },
  { phrase: 'next week', min: 1 },
  { phrase: 'next month', min: 1 },
  ...WEEKDAYS.map((day) => ({ phrase: day, min: 2 })),
  ...WEEKDAYS.map((day) => ({ phrase: `next ${day}`, min: 6 })),
  ...MONTHS.flatMap((month) => [
    { phrase: `${month} 1`, min: 3 },
    { phrase: `${month} 15`, min: 3 }
  ])
];

// "in 2 h" / "in a few d": the unit as typed so far, matched as a prefix.
const DURATION_UNITS: { unit: string; aliases: string[]; whenBare: boolean }[] = [
  { unit: 'minute', aliases: ['minutes', 'mins'], whenBare: true },
  { unit: 'hour', aliases: ['hours', 'hrs'], whenBare: true },
  { unit: 'day', aliases: ['days'], whenBare: true },
  { unit: 'week', aliases: ['weeks', 'wks'], whenBare: true },
  { unit: 'month', aliases: ['months'], whenBare: false }
];
const DURATION_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  couple: 2,
  'a couple': 2,
  'couple of': 2,
  'a couple of': 2,
  few: 3,
  'a few': 3,
  several: 5
};

/**
 * Snooze times for what's typed in the palette's "Snooze until…" page, best
 * first (Enter picks the first row): what the text says exactly, then other
 * times that day, then completions of a half-typed word. One row per time.
 * `now` is injectable for tests; the page passes nothing.
 */
export function getReminderSuggestions(input: string, now: Date = new Date()): Suggestion[] {
  const text = input.toLowerCase().replace(/\s+/g, ' ').trim();
  const ref = dayjs(now);

  if (!text) return finalize(getDefaultSuggestions(ref), ref);

  return finalize(
    [
      ...getParsedSuggestions(text, ref),
      ...getClockSuggestions(text, ref),
      ...getDurationSuggestions(text, ref),
      ...getPrefixSuggestions(text, ref)
    ],
    ref
  );
}

function getDefaultSuggestions(ref: dayjs.Dayjs): (Suggestion | null)[] {
  const nextMonday = chrono.parseDate('next monday at 9am', ref.toDate(), PARSE_OPTIONS);
  return [
    relative('in 30 minutes', ref),
    relative('in 2 hours', ref),
    withLabel(absolute(ref.add(1, 'day').hour(9).minute(0), ref), 'Tomorrow at 9 AM'),
    // A time, not chrono's implied noon for a bare day.
    nextMonday ? withLabel(absolute(dayjs(nextMonday), ref), 'Next Monday at 9 AM') : null
  ];
}

/** What chrono reads in the text: the exact interpretation, first. */
function getParsedSuggestions(text: string, ref: dayjs.Dayjs): (Suggestion | null)[] {
  const suggestions: (Suggestion | null)[] = [];
  let results: chrono.ParsedResult[] = [];
  try {
    results = chrono.parse(text, ref.toDate(), PARSE_OPTIONS);
  } catch {
    return suggestions;
  }

  for (const result of results) {
    const { start } = result;
    const tags = result.tags();
    const parsed = dayjs(start.date());

    // chrono reads a half-typed "next m" as "next minute"; it's "next month"
    // or "next monday" on its way, which the completions offer.
    if (/^(next|this|last) [a-z]$/.test(result.text)) continue;

    // "in 2 hours", "in 3 days", "2 days from now": exactly that long from now.
    // ("next week" is relative too, but it names a day, so it's handled below.)
    if (tags.has('result/relativeDate') && !/\b(next|this|last|coming)\b/.test(result.text)) {
      suggestions.push(canonicalDuration(result.text, parsed, ref) ?? relative(result.text, ref));
      // A days-long wait also offers the morning of the day it lands on.
      if (!parsed.isSame(ref, 'day')) suggestions.push(...daySlots(parsed, ref, 1));
      continue;
    }

    const casualTime = tags.has('parser/ENCasualTimeParser') || tags.has('casualReference/tonight');
    if (!start.isCertain('hour') && !casualTime) {
      // A day with no time ("tomorrow", "friday", "may 6"), maybe next to a
      // time chrono left unread ("tomorrow 5", "5 tomorrow").
      const clock =
        parseClock(text.slice(result.index + result.text.length)) ??
        parseClock(text.slice(0, result.index));
      suggestions.push(...(clock ? dayClockRows(parsed, clock, ref) : daySlots(parsed, ref)));
      continue;
    }

    let date = parsed;
    const typedHour = start.get('hour') ?? date.hour();
    const noMeridiem = start.isCertain('hour') && !start.isCertain('meridiem');
    // "at 2" / "5:30" without am/pm: a snooze means the afternoon, not 2 AM.
    if (noMeridiem) {
      const hour = typedHour;
      if (hour >= 1 && hour <= 6) date = date.hour(hour + 12);
    }
    // chrono's "morning" is 6 AM; a snooze's morning is 9, as for a bare day.
    if (tags.has('casualReference/morning') && !start.isCertain('hour')) {
      date = atClock(date, { hour: DAY_SLOT_HOURS[0], minute: 0 });
    }

    const dayKnown =
      start.isCertain('day') || start.isCertain('weekday') || start.isCertain('month');
    if (dayKnown) {
      // "today at 7", "tomorrow at 9": without am/pm, the waking-hours one.
      suggestions.push(
        ...dayClockRows(
          date,
          {
            hour: date.hour(),
            minute: date.minute(),
            ambiguous: noMeridiem && typedHour >= 1 && typedHour <= 12
          },
          ref
        )
      );
    } else if (/\bthis\b/.test(result.text)) {
      // "this afternoon" is today's, or nothing once it's gone (chrono rolls
      // it to tomorrow, which "this" never means).
      suggestions.push(absolute(atClock(ref, { hour: date.hour(), minute: date.minute() }), ref));
    } else {
      // A time alone ("5 pm"): today if it's still ahead, else tomorrow;
      // without am/pm ("at 7"), the next one in waking hours (clockRows).
      suggestions.push(
        ...clockRows(
          {
            hour: date.hour(),
            minute: date.minute(),
            ambiguous: noMeridiem && typedHour >= 1 && typedHour <= 12
          },
          ref
        )
      );
    }
  }

  return suggestions;
}

/** Clock times chrono doesn't read: "5", "5p", "1430", "930". */
function getClockSuggestions(text: string, ref: dayjs.Dayjs): (Suggestion | null)[] {
  const military = /^(\d{1,2})(\d{2})$/.exec(text);
  if (military) {
    let hour = Number(military[1]);
    const minute = Number(military[2]);
    if (hour >= 24 || minute >= 60) return [];
    // "530", "1030": a time typed without the colon, so without am/pm too.
    // A leading 0 or an hour past 12 ("0930", "1430") is the 24-hour clock.
    const ambiguous = !text.startsWith('0') && hour >= 1 && hour <= 12;
    if (ambiguous && hour <= 6) hour += 12;
    return clockRows({ hour, minute, ambiguous }, ref);
  }

  const clock = parseClock(text);
  const suggestions: (Suggestion | null)[] = clock ? clockRows(clock, ref) : [];

  // A bare number might be a time, a duration or a day of the month. The time
  // comes first (above); the rest follow.
  if (/^\d{1,2}$/.test(text)) {
    const num = Number(text);
    if (num === 0) return suggestions;
    if (num <= 60) suggestions.push(relative(durationValue(num, 'minute'), ref));
    if (num <= 24) suggestions.push(relative(durationValue(num, 'hour'), ref));
    if (num <= 31) suggestions.push(relative(durationValue(num, 'day'), ref));
    for (const month of [ref, ref.add(1, 'month')]) {
      if (num <= month.daysInMonth()) suggestions.push(...daySlots(month.date(num), ref, 1));
    }
  }

  return suggestions;
}

/** "in", "in 2", "in 2 h", "in a few d": durations matching what's typed. */
function getDurationSuggestions(text: string, ref: dayjs.Dayjs): (Suggestion | null)[] {
  const match = /^in?(?: (.*))?$/.exec(text);
  if (!match) return [];
  const rest = match[1]?.trim() ?? '';
  if (text === 'i' || !rest) {
    return ['in 30 minutes', 'in 1 hour', 'in 2 hours', 'in 1 day', 'in 1 week'].map((value) =>
      relative(value, ref)
    );
  }

  const duration = parseDuration(rest);
  if (!duration) return [];
  return duration.units.map((unit) => relative(durationValue(duration.count, unit), ref));
}

/**
 * "2 h", "a few", "a couple of d" (what follows "in"): the amount, and the
 * units the half-typed unit could be (all the usual ones when there's none).
 */
function parseDuration(text: string): { count: number; units: string[] } | null {
  let count = 0;
  let unitTyped = '';
  const numeric = /^(\d+) ?([a-z]*)$/.exec(text);
  if (numeric) {
    count = Number(numeric[1]);
    unitTyped = numeric[2];
  } else {
    // Longest first, so "a few" isn't read as "a" + "few".
    const word = Object.keys(DURATION_WORDS)
      .sort((a, b) => b.length - a.length)
      .find((w) => text === w || new RegExp(`^${w} [a-z]*$`).test(text));
    if (!word) return null;
    count = DURATION_WORDS[word];
    unitTyped = text.slice(word.length).trim();
  }
  if (!count) return null;

  const units = DURATION_UNITS.filter(({ unit, aliases, whenBare }) =>
    // A lone "m" is minutes, as chrono reads "30m"; months take "mo".
    unitTyped === 'm'
      ? unit === 'minute'
      : unitTyped
        ? aliases.some((alias) => alias.startsWith(unitTyped))
        : whenBare
  ).map(({ unit }) => unit);
  return units.length > 0 ? { count, units } : null;
}

/** Half-typed day words: "t" / "tom" → Tomorrow, "fr" → Friday, "next m" → … */
function getPrefixSuggestions(text: string, ref: dayjs.Dayjs): (Suggestion | null)[] {
  const typed = text.replace(/^on /, '');
  const days = PREFIX_PHRASES.filter(
    ({ phrase, min }) => typed.length >= min && phrase.startsWith(typed)
  ).map(({ phrase }) => {
    const date = chrono.parseDate(phrase, ref.toDate(), PARSE_OPTIONS);
    return date ? daySlots(dayjs(date), ref) : [];
  });
  // A month's 1st and 15th soonest first: "nov" on Nov 5 is the 15th, not
  // next year's 1st. (Typed letters never match a month and another word.)
  if (MONTHS.some((month) => month.startsWith(typed))) {
    days.sort((a, b) => (a[0]?.date.getTime() ?? Infinity) - (b[0]?.date.getTime() ?? Infinity));
  }

  // Each day's first slot, then each day's second, so several days show up.
  const suggestions: Suggestion[] = [];
  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    for (const rows of days) if (rows[slot]) suggestions.push(rows[slot]);
  }
  return suggestions;
}

// --- Building rows -----------------------------------------------------------

type Clock = { hour: number; minute: number; ambiguous?: boolean };

/**
 * "5", "5pm", "5:30 p.m.", "at 2", "17:00" as a time of day. Without am/pm,
 * 1–6 means the afternoon and 7–11 the morning (`ambiguous`: a time alone
 * then takes whichever comes round next in waking hours, clockRows).
 */
function parseClock(text: string): Clock | null {
  const match = /^\s*(?:at |@ ?)?(\d{1,2})(?::(\d{2}))? ?(a|p|am|pm|a\.m\.?|p\.m\.?)?\s*$/.exec(
    text
  );
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.charAt(0);
  if (minute >= 60) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'p' && hour < 12) hour += 12;
    if (meridiem === 'a' && hour === 12) hour = 0;
  } else {
    if (hour > 23) return null;
    const ambiguous = hour >= 1 && hour <= 12;
    if (hour >= 1 && hour <= 6) hour += 12;
    return { hour, minute, ambiguous };
  }
  return { hour, minute };
}

// Waking hours for a time typed without am/pm: 7 AM to 10 PM.
const WAKING_FROM = 7;
const WAKING_UNTIL = 22;

/**
 * A time of day typed alone. Without am/pm ("7", "at 9") it's whichever of
 * the two comes round next within waking hours, then the other: "7" at
 * 3:30 PM is 7 PM tonight (then 7 AM tomorrow); "9" at 8 AM is 9 AM today.
 */
function clockRows(clock: Clock, ref: dayjs.Dayjs): Suggestion[] {
  if (!clock.ambiguous) return timeRows(clock, ref);
  const base = clock.hour % 12;
  const next = (hour: number) => {
    const today = atClock(ref, { hour, minute: clock.minute });
    return today.isAfter(ref) ? today : today.add(1, 'day');
  };
  const candidates = [base, base + 12]
    .filter((hour) => hour >= WAKING_FROM && hour <= WAKING_UNTIL)
    .map(next)
    .sort((a, b) => a.valueOf() - b.valueOf());
  if (candidates.length === 0) return timeRows(clock, ref);
  // One option only ("5" is never 5 AM): that time today and tomorrow.
  if (candidates.length === 1) {
    return timeRows({ hour: candidates[0].hour(), minute: clock.minute }, ref);
  }
  return candidates.map((date) => absolute(date, ref));
}

function atClock(day: dayjs.Dayjs, { hour, minute }: Clock): dayjs.Dayjs {
  return day.hour(hour).minute(minute).second(0).millisecond(0);
}

/**
 * A time on a given day ("today at 7", "tomorrow 9"). Without am/pm, the
 * halves within waking hours that are still ahead: soonest first for today,
 * the usual reading first (1–6 PM, 7–11 AM) for a later day.
 */
function dayClockRows(day: dayjs.Dayjs, clock: Clock, ref: dayjs.Dayjs): Suggestion[] {
  if (!clock.ambiguous) return [absolute(atClock(day, clock), ref)];
  const base = clock.hour % 12;
  const halves = [clock.hour, clock.hour === base ? base + 12 : base]
    .map((hour) => atClock(day, { hour, minute: clock.minute }))
    .filter((date) => date.isAfter(ref));
  const waking = halves.filter((date) => date.hour() >= WAKING_FROM && date.hour() <= WAKING_UNTIL);
  // "today at 11" at 3 PM: 11 PM, though late, is the only 11 left today.
  const options = waking.length > 0 ? waking : halves;
  if (day.isSame(ref, 'day')) options.sort((a, b) => a.valueOf() - b.valueOf());
  return options.map((date) => absolute(date, ref));
}

/** A time of day: today if still ahead (then tomorrow too), else tomorrow. */
function timeRows(clock: Clock, ref: dayjs.Dayjs): Suggestion[] {
  const today = atClock(ref, clock);
  return today.isAfter(ref)
    ? [absolute(today, ref), absolute(today.add(1, 'day'), ref)]
    : [absolute(today.add(1, 'day'), ref)];
}

/** A day without a time: its first slots still ahead, 9 AM first. */
function daySlots(day: dayjs.Dayjs, ref: dayjs.Dayjs, count = SLOTS_PER_DAY): Suggestion[] {
  return DAY_SLOT_HOURS.map((hour) => atClock(day, { hour, minute: 0 }))
    .filter((slot) => slot.isAfter(ref))
    .slice(0, count)
    .map((slot) => absolute(slot, ref));
}

function absolute(date: dayjs.Dayjs, ref: dayjs.Dayjs): Suggestion {
  const at = date.second(0).millisecond(0);
  const time = at.minute() === 0 ? at.format('h A') : at.format('h:mm A');
  return {
    label: `${formatNaturalDate(at, ref)} at ${time}`,
    value: at.format('MMMM D YYYY [at] h:mma'),
    date: at.toDate(),
    type: 'absolute'
  };
}

function relative(value: string, ref: dayjs.Dayjs): Suggestion | null {
  const date = chrono.parseDate(value, ref.toDate(), PARSE_OPTIONS);
  if (!date) return null;
  return { label: capitalize(value), value, date, type: 'relative' };
}

/**
 * "in 2 h" / "a couple of days from now" as "In 2 hours" / "In 2 days": the
 * unit that lands on the minute chrono read ("in 2 m" is minutes to chrono).
 */
function canonicalDuration(text: string, parsed: dayjs.Dayjs, ref: dayjs.Dayjs): Suggestion | null {
  const match = /^(?:in )?(.+?)(?: from now| later)?$/.exec(text);
  const duration = match ? parseDuration(match[1]) : null;
  if (!duration) return null;
  for (const unit of duration.units) {
    const suggestion = relative(durationValue(duration.count, unit), ref);
    if (suggestion && Math.abs(dayjs(suggestion.date).diff(parsed, 'minute')) < 1) {
      return suggestion;
    }
  }
  return null;
}

function withLabel(suggestion: Suggestion, label: string): Suggestion {
  return { ...suggestion, label };
}

function durationValue(count: number, unit: string): string {
  return `in ${count} ${count === 1 ? unit : `${unit}s`}`;
}

function formatNaturalDate(date: dayjs.Dayjs, ref: dayjs.Dayjs): string {
  // Compare calendar days, not 24h spans: "tomorrow 9am" typed at 11 PM is
  // only 10 hours away and was labelled "Today".
  const daysDiff = date.startOf('day').diff(ref.startOf('day'), 'day');

  if (daysDiff === 0) return 'Today';
  if (daysDiff === 1) return 'Tomorrow';
  // Within the week: "Monday". A week out is a date, so next Thursday isn't
  // labelled "Thursday" on a Thursday.
  if (daysDiff < 7) return date.format('dddd');
  if (date.year() === ref.year()) return date.format('MMM D'); // Mar 15

  return date.format('MMM D, YYYY'); // Mar 15, 2027
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Drops past and unparsed rows and repeats of the same minute; keeps order. */
function finalize(candidates: (Suggestion | null)[], ref: dayjs.Dayjs): Suggestion[] {
  const seen = new Set<number>();
  const result: Suggestion[] = [];
  for (const suggestion of candidates) {
    if (!suggestion || !dayjs(suggestion.date).isAfter(ref)) continue;
    const minute = Math.floor(suggestion.date.getTime() / 60_000);
    if (seen.has(minute)) continue;
    seen.add(minute);
    result.push(suggestion);
    if (result.length === MAX_RESULTS) break;
  }
  return result;
}
