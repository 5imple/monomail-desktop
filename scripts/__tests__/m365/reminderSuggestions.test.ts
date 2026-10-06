import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as chrono from 'chrono-node';
import { getReminderSuggestions } from '@/renderer/app/containers/command/getReminderSuggestions';

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
