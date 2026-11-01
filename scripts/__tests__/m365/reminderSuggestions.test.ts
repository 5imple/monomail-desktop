import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as chrono from 'chrono-node';
import { getReminderSuggestions } from '@/renderer/app/containers/command/getReminderSuggestions';

// The "Snooze until…" page (Later, H). Enter picks the first row, so the
// first row must be what the text says. All times are local.

// Thursday, November 5 2026, 3:30 PM.
const NOW = new Date(2026, 10, 5, 15, 30);
const at = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  new Date(year, month - 1, day, hour, minute);
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const suggest = (input: string) => getReminderSuggestions(input, NOW);
const describe = (input: string) =>
  suggest(input)
    .map((s) => `${s.label} (${s.date.toString().slice(0, 21)})`)
    .join(' | ') || '(none)';

function assertFirst(input: string, expected: Date, label?: string) {
  const [first] = suggest(input);
  assert.ok(first, `no suggestions for "${input}"`);
  assert.equal(
    first.date.getTime(),
    expected.getTime(),
    `"${input}" first row: ${describe(input)}`
  );
  if (label) assert.equal(first.label, label, `"${input}" first label`);
}

// --- The first row is the exact interpretation -------------------------------

const firstRows: [input: string, expected: Date, label?: string][] = [
  // Durations: exactly that long from now, not "Tomorrow at 2 AM".
  ['in 2 hours', later(120), 'In 2 hours'],
  ['in 3 days', at(11, 8, 15, 30), 'In 3 days'],
  ['in 30 minutes', later(30), 'In 30 minutes'],
  ['in 2h', later(120), 'In 2 hours'],
  ['2 hours', later(120), 'In 2 hours'],
  ['in a week', at(11, 12, 15, 30), 'In 1 week'],
  // A day without a time: 9 AM that day.
  ['tomorrow', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['Tomorrow', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['tmr', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['tmrw', at(11, 6, 9)],
  ['next monday', at(11, 9, 9), 'Monday at 9 AM'],
  ['Next Monday', at(11, 9, 9), 'Monday at 9 AM'],
  ['monday', at(11, 9, 9)],
  ['mon', at(11, 9, 9)],
  ['friday', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['on friday', at(11, 6, 9)],
  ['thursday', at(11, 12, 9), 'Nov 12 at 9 AM'],
  ['next week', at(11, 12, 9)],
  ['next month', at(12, 5, 9)],
  ['may 6', at(5, 6, 9, 0, 2027), 'May 6, 2027 at 9 AM'],
  ['5/6', at(5, 6, 9, 0, 2027)],
  // "today" at 3:30 PM: its morning has gone, so the evening.
  ['today', at(11, 5, 18), 'Today at 6 PM'],
  // A time alone: today if still ahead, else tomorrow.
  ['5 pm', at(11, 5, 17), 'Today at 5 PM'],
  ['5pm', at(11, 5, 17)],
  ['5p', at(11, 5, 17)],
  ['3pm', at(11, 6, 15), 'Tomorrow at 3 PM'],
  ['14:30', at(11, 6, 14, 30), 'Tomorrow at 2:30 PM'],
  ['1430', at(11, 6, 14, 30)],
  ['5:30', at(11, 5, 17, 30), 'Today at 5:30 PM'],
  ['at 2', at(11, 6, 14)],
  // Without am/pm: the next one in waking hours (7 AM–10 PM).
  ['7', at(11, 5, 19), 'Today at 7 PM'],
  ['at 7', at(11, 5, 19), 'Today at 7 PM'],
  ['9', at(11, 5, 21), 'Today at 9 PM'],
  ['11', at(11, 6, 11), 'Tomorrow at 11 AM'],
  ['8:30', at(11, 5, 20, 30), 'Today at 8:30 PM'],
  // A day with a bare hour: the waking-hours one still ahead.
  ['today at 7', at(11, 5, 19), 'Today at 7 PM'],
  ['today 7', at(11, 5, 19)],
  ['7 today', at(11, 5, 19)],
  ['today at 9:30', at(11, 5, 21, 30)],
  ['tomorrow at 7', at(11, 6, 7), 'Tomorrow at 7 AM'],
  // Without the colon: still no am/pm.
  ['530', at(11, 5, 17, 30), 'Today at 5:30 PM'],
  ['730', at(11, 5, 19, 30), 'Today at 7:30 PM'],
  ['0930', at(11, 6, 9, 30), 'Tomorrow at 9:30 AM'],
  // Day and time.
  ['tomorrow 9am', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['tomorrow at 2', at(11, 6, 14), 'Tomorrow at 2 PM'],
  ['tomorrow 5', at(11, 6, 17)],
  ['fri 3pm', at(11, 6, 15)],
  ['tonight', at(11, 5, 22), 'Today at 10 PM'],
  ['5 tomorrow', at(11, 6, 17), 'Tomorrow at 5 PM'],
  // A snooze's morning is 9 AM, not chrono's 6 AM.
  ['tomorrow morning', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['monday morning', at(11, 9, 9), 'Monday at 9 AM'],
  ['this evening', at(11, 5, 20), 'Today at 8 PM'],
  // Half-typed words complete.
  ['t', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['to', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['tom', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['tomo', at(11, 6, 9), 'Tomorrow at 9 AM'],
  ['fr', at(11, 6, 9)],
  ['sa', at(11, 7, 9), 'Saturday at 9 AM'],
  ['on fr', at(11, 6, 9)],
  ['next', at(11, 12, 9)],
  ['next m', at(12, 5, 9)],
  ['in', later(30), 'In 30 minutes'],
  ['in 2', later(2), 'In 2 minutes'],
  // A month's soonest 1st or 15th, not next year's 1st.
  ['nov', at(11, 15, 9), 'Nov 15 at 9 AM'],
  ['dec', at(12, 1, 9), 'Dec 1 at 9 AM']
];

for (const [input, expected, label] of firstRows) {
  test(`reminderSuggestions: "${input}" → first row`, () => assertFirst(input, expected, label));
}

test('reminderSuggestions: an empty input offers the presets', () => {
  assert.deepEqual(
    suggest('').map((s) => [s.label, s.date.getTime()]),
    [
      ['In 30 minutes', later(30).getTime()],
      ['In 2 hours', later(120).getTime()],
      ['Tomorrow at 9 AM', at(11, 6, 9).getTime()],
      ['Next Monday at 9 AM', at(11, 9, 9).getTime()]
    ]
  );
});

// --- Second rows --------------------------------------------------------------

test('reminderSuggestions: a bare day offers 9 AM, then 2 PM', () => {
  for (const input of ['tomorrow', 'next monday', 'monday', 'friday']) {
    const hours = suggest(input).map((s) => s.date.getHours());
    assert.deepEqual(hours.slice(0, 2), [9, 14], `"${input}": ${describe(input)}`);
  }
});

test('reminderSuggestions: "5 pm" offers today, then tomorrow', () => {
  assert.deepEqual(
    suggest('5 pm').map((s) => s.date.getTime()),
    [at(11, 5, 17).getTime(), at(11, 6, 17).getTime()]
  );
});

test('reminderSuggestions: "to" offers tomorrow and today’s evening', () => {
  const dates = suggest('to').map((s) => s.date.getTime());
  assert.ok(dates.includes(at(11, 5, 18).getTime()), describe('to'));
});

test('reminderSuggestions: "in 2" offers each unit', () => {
  assert.deepEqual(
    suggest('in 2').map((s) => s.label),
    ['In 2 minutes', 'In 2 hours', 'In 2 days', 'In 2 weeks']
  );
});

test('reminderSuggestions: "in a few" reads the whole phrase', () => {
  assert.equal(suggest('in a few h')[0]?.label, 'In 3 hours');
  assert.equal(suggest('in a couple of d')[0]?.label, 'In 2 days');
});

test('reminderSuggestions: numbers in a duration aren’t also read as times', () => {
  for (const input of ['in 2 hours', 'in 3 days', 'in 2', 'in 5 minutes']) {
    for (const s of suggest(input)) {
      assert.doesNotMatch(s.label, /^(Today|Tomorrow) at \d+ (AM|PM)$/, `"${input}": ${s.label}`);
    }
  }
});

test('reminderSuggestions: a bare number is a time first, then durations', () => {
  // 2 PM has passed today; 1–6 means the afternoon.
  assertFirst('2', at(11, 6, 14), 'Tomorrow at 2 PM');
  assertFirst('5', at(11, 5, 17), 'Today at 5 PM');
  // 9 PM tonight comes round before 9 AM tomorrow, and both are waking hours.
  assertFirst('9', at(11, 5, 21), 'Today at 9 PM');
  assert.equal(suggest('9')[1].label, 'Tomorrow at 9 AM');
  const labels = suggest('2').map((s) => s.label);
  assert.ok(labels.includes('In 2 hours'), labels.join(', '));
  assert.ok(labels.includes('In 2 minutes'), labels.join(', '));
  // Not a clock time, but still a duration or a date.
  assertFirst('30', later(30), 'In 30 minutes');
});

test('reminderSuggestions: a lone "m" is minutes, as chrono reads it', () => {
  assert.deepEqual(
    suggest('in 2 m').map((s) => s.label),
    ['In 2 minutes']
  );
  assert.deepEqual(
    suggest('in 30m').map((s) => s.label),
    ['In 30 minutes']
  );
  assert.equal(suggest('in 2 mo')[0]?.label, 'In 2 months');
});

test('reminderSuggestions: "this …" is today’s, never rolled to tomorrow', () => {
  // At 3:30 PM this morning and chrono's 3 PM afternoon have gone.
  for (const input of ['this morning', 'this afternoon', 'this morning at 10']) {
    assert.deepEqual(suggest(input), [], `"${input}": ${describe(input)}`);
  }
});

test('reminderSuggestions: nonsense finds nothing', () => {
  assert.deepEqual(suggest('xyz'), []);
});

// --- Every list ---------------------------------------------------------------

const everyInput = [
  '',
  ...firstRows.map(([input]) => input),
  '2',
  '9',
  '12',
  '17',
  '30',
  'nov',
  'next mon',
  'in 2 m',
  'noon',
  'midnight',
  'this afternoon',
  'next year',
  'in 2 mo',
  'jan',
  'evening',
  'morning'
];

test('reminderSuggestions: rows are unique, ahead of now, and re-read to their time', () => {
  for (const input of everyInput) {
    const suggestions = suggest(input);
    const context = `"${input}": ${describe(input)}`;
    assert.ok(suggestions.length <= 6, context);

    const minutes = suggestions.map((s) => Math.floor(s.date.getTime() / 60_000));
    assert.equal(new Set(minutes).size, minutes.length, `repeated time — ${context}`);
    // The value is the React key and the cmdk value.
    const values = suggestions.map((s) => s.value.toLowerCase());
    assert.equal(new Set(values).size, values.length, `repeated value — ${context}`);

    for (const s of suggestions) {
      assert.ok(s.date.getTime() > NOW.getTime(), `past row ${s.label} — ${context}`);
      // What the page schedules on Enter is the time the row shows.
      const reparsed = chrono.parseDate(s.value, NOW, { forwardDate: true });
      assert.ok(reparsed, `"${s.value}" doesn't parse — ${context}`);
      assert.ok(
        Math.abs(reparsed.getTime() - s.date.getTime()) < 60_000,
        `"${s.value}" re-reads as ${reparsed.toString()} — ${context}`
      );
    }
  }
});

// Weekday reminders must resolve to the NEXT such day. Without chrono's
// forwardDate, a bare weekday resolved to the nearest one (often in the past)
// and was filtered out, so "fri" / "sat" offered nothing.

const resolve = (value: string) => chrono.parseDate(value, new Date(), { forwardDate: true });

for (const [input, weekday] of [
  ['fri', 5],
  ['friday', 5],
  ['sat', 6],
  ['sun', 0]
] as const) {
  test(`reminderSuggestions: "${input}" offers a future ${input}`, () => {
    const suggestions = getReminderSuggestions(input);
    assert.ok(suggestions.length > 0, `no suggestions for "${input}"`);
    const dates = suggestions.map((s) => resolve(s.value)).filter((d): d is Date => !!d);
    assert.ok(
      dates.some((d) => d.getDay() === weekday && d.getTime() > Date.now()),
      `no future weekday ${weekday} among ${suggestions.map((s) => s.value).join(', ')}`
    );
  });
}

test('reminderSuggestions: a bare hour never offers 1–6 AM or midnight', () => {
  for (const input of ['3', '5', '12']) {
    const hours = suggest(input).map((s) => s.date.getHours() + s.date.getMinutes() / 60);
    assert.ok(
      hours.every((hour) => !(hour < 7 && Number.isInteger(hour) && hour === Number(input) % 12)),
      `"${input}": ${describe(input)}`
    );
  }
  // "today at 11" at 3:30 PM: 11 AM has gone, so 11 PM though it's late.
  assertFirst('today at 11', at(11, 5, 23), 'Today at 11 PM');
});
