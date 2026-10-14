import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedulePresets } from '@/renderer/app/containers/queue/schedulePresets';

// Snooze, Send later and the Later view's Reschedule all offer these presets.

const ids = (now: Date) => buildSchedulePresets(now).map((preset) => preset.id);
const labelOf = (now: Date, id: string) =>
  buildSchedulePresets(now).find((preset) => preset.id === id)?.label;

test('schedulePresets: on Friday "Tomorrow morning" and the weekend are one option', () => {
  const friday = new Date(2026, 9, 9, 10, 0);
  assert.equal(friday.getDay(), 5);
  const list = ids(friday);
  assert.ok(list.includes('tomorrow-morning'));
  assert.ok(!list.includes('this-weekend'));
});

test('schedulePresets: on Sunday "Tomorrow morning" covers next Monday, and the weekend reads "Next weekend"', () => {
  const sunday = new Date(2026, 9, 11, 10, 0);
  assert.equal(sunday.getDay(), 0);
  const list = ids(sunday);
  assert.ok(list.includes('tomorrow-morning'));
  assert.ok(!list.includes('next-week'));
  assert.equal(labelOf(sunday, 'this-weekend'), 'Next weekend');
});

test('schedulePresets: "Later today" only when it is clearly after "In 1 hour"', () => {
  assert.ok(ids(new Date(2026, 9, 7, 10, 0)).includes('later-today'));
  assert.ok(!ids(new Date(2026, 9, 7, 16, 45)).includes('later-today'));
  assert.ok(!ids(new Date(2026, 9, 7, 19, 0)).includes('later-today'));
});

test('schedulePresets: no two options share a time, and "Pick a date…" is always last', () => {
  for (let day = 5; day <= 11; day++) {
    const list = buildSchedulePresets(new Date(2026, 9, day, 9, 0));
    const times = list.map((preset) => preset.scheduledFor).filter(Boolean);
    assert.equal(new Set(times).size, times.length);
    assert.equal(list[list.length - 1].id, 'custom');
  }
  assert.equal(labelOf(new Date(2026, 9, 7, 9, 0), 'this-weekend'), 'This weekend');
});
