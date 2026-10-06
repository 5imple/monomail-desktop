import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventSpansDay } from '@/renderer/app/containers/panel/calendar/utils';

// eventSpansDay decides which day(s) of the calendar grid an event lands on.

const allDay = (start: string, end: string) =>
  ({
    id: 'a',
    allDay: true,
    start: { date: start },
    end: { date: end }
  }) as any;

const timed = (start: Date, end: Date) =>
  ({
    id: 't',
    allDay: false,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() }
  }) as any;

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

test('calendarDaySpan: an all-day event shows on its local day late in the evening', () => {
  const evening = new Date(2026, 9, 5, 21, 30); // Oct 5, 9:30 PM local
  assert.equal(eventSpansDay(allDay('2026-10-05', '2026-10-06'), evening), true);
  assert.equal(eventSpansDay(allDay('2026-10-06', '2026-10-07'), evening), false);
});

test('calendarDaySpan: an all-day event shows on its local day early in the morning', () => {
  const morning = new Date(2026, 9, 5, 0, 30); // Oct 5, 12:30 AM local
  assert.equal(eventSpansDay(allDay('2026-10-05', '2026-10-06'), morning), true);
  assert.equal(eventSpansDay(allDay('2026-10-04', '2026-10-05'), morning), false);
});

test('calendarDaySpan: a timed event ending exactly at midnight stays on its own day', () => {
  const event = timed(new Date(2026, 9, 4, 23, 0), new Date(2026, 9, 5, 0, 0));
  assert.equal(eventSpansDay(event, new Date(2026, 9, 4, 12, 0), tz), true);
  assert.equal(eventSpansDay(event, new Date(2026, 9, 5, 12, 0), tz), false);
});

test('calendarDaySpan: a timed event crossing midnight shows on both days', () => {
  const event = timed(new Date(2026, 9, 4, 23, 0), new Date(2026, 9, 5, 1, 0));
  assert.equal(eventSpansDay(event, new Date(2026, 9, 4, 12, 0), tz), true);
  assert.equal(eventSpansDay(event, new Date(2026, 9, 5, 12, 0), tz), true);
});
