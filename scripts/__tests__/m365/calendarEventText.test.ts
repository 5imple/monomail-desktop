import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  DARK_TEXT_ON_ACCENT,
  findJoinLink,
  htmlToPlainText,
  looksLikeHtml,
  readableTextOn
} from '@/renderer/app/containers/panel/calendar/eventText';
import { formatTimeRange } from '@/renderer/app/containers/panel/calendar/utils';

// The calendar panel reads Outlook's HTML event bodies as text, offers a Join
// button for online meetings, and picks legible text on a selected event's
// accent fill.

(globalThis as any).DOMParser = new JSDOM('').window.DOMParser;

const teamsJoin =
  'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%3a%22x%22%7d';

test('calendarEventText: a Teams invite body is detected as HTML; prose with angle brackets is not', () => {
  assert.equal(
    looksLikeHtml('<html><head><style>p{}</style></head><body><p>Hi</p></body></html>'),
    true
  );
  assert.equal(looksLikeHtml('Bring snacks<br>and drinks'), true);
  assert.equal(looksLikeHtml('Agenda <draft> for review'), false);
  assert.equal(looksLikeHtml('if x < y and y > z'), false);
});

test('calendarEventText: an HTML body reads as text, without its styles', () => {
  const text = htmlToPlainText(
    '<html><head><style>p { color: red }</style><title>t</title></head>' +
      '<body><p>Hello&nbsp;team</p><div>Line one<br>Line two</div><p></p><p></p><p>End</p></body></html>'
  );
  assert.equal(text, 'Hello team\nLine one\nLine two\n\nEnd');
});

test('calendarEventText: the Teams join link comes out of an HTML href, entities decoded', () => {
  const body = `<p><a href="${teamsJoin.replace('?', '?a=1&amp;')}">Click here to join the meeting</a></p>`;
  const link = findJoinLink([undefined, 'Microsoft Teams Meeting', body]);
  assert.equal(link?.label, 'Join Teams meeting');
  assert.equal(link?.url, teamsJoin.replace('?', '?a=1&'));
});

test('calendarEventText: Meet and Zoom links are found, trailing punctuation dropped', () => {
  assert.deepEqual(findJoinLink(['Join at https://meet.google.com/abc-defg-hij.']), {
    url: 'https://meet.google.com/abc-defg-hij',
    label: 'Join Google Meet'
  });
  assert.deepEqual(findJoinLink(['(https://washcoll.zoom.us/j/123456789?pwd=xyz)']), {
    url: 'https://washcoll.zoom.us/j/123456789?pwd=xyz',
    label: 'Join Zoom meeting'
  });
});

test('calendarEventText: only https meeting links count, earlier sources first', () => {
  assert.equal(findJoinLink(['http://meet.google.com/abc-defg-hij']), null);
  assert.equal(findJoinLink(['https://example.com/meeting', 'Room 201']), null);
  assert.equal(
    findJoinLink(['https://meet.google.com/aaa-bbbb-ccc', teamsJoin])?.label,
    'Join Google Meet'
  );
});

test('calendarEventText: text on an accent fill is white on dark accents, near-black on light ones', () => {
  assert.equal(readableTextOn('#035ddf'), '#fff'); // Blue
  assert.equal(readableTextOn('#ef4444'), '#fff'); // Red
  assert.equal(readableTextOn('#a855f7'), '#fff'); // Purple
  assert.equal(readableTextOn('#4b5563'), '#fff'); // Gray
  assert.equal(readableTextOn('#fb923c'), DARK_TEXT_ON_ACCENT); // Orange
  assert.equal(readableTextOn('#facc15'), DARK_TEXT_ON_ACCENT); // Yellow
  assert.equal(readableTextOn('#d1d5db'), DARK_TEXT_ON_ACCENT); // Silver
  assert.equal(readableTextOn('#f9a8d4'), DARK_TEXT_ON_ACCENT); // Pink
  assert.equal(readableTextOn('#22c55e'), DARK_TEXT_ON_ACCENT); // Green
  assert.equal(readableTextOn('#fff'), DARK_TEXT_ON_ACCENT); // short hex
  assert.equal(readableTextOn('not-a-color'), '#fff');
});

test('calendarEventText: time ranges drop a repeated AM/PM and use an en dash', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m);
  assert.equal(formatTimeRange(at(15), at(16)), '3:00 – 4:00 PM');
  assert.equal(formatTimeRange(at(11, 30), at(12, 30)), '11:30 AM – 12:30 PM');
  assert.equal(formatTimeRange(at(9), at(9, 15)), '9:00 – 9:15 AM');
});
