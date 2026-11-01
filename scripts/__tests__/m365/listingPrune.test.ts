import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK_MARGIN_MS, leftFolder } from '@/renderer/app/lib/listingPrune';

// Mail archived in Outlook leaves the app's Inbox even when the change itself
// never reached the app.

const MIN = 60 * 1000;
const NOW = Date.parse('2026-11-06T12:00:00Z');
const at = (minutesAgo: number) => NOW - minutesAgo * MIN;
const msg = (id: string, minutesAgo: number, labelIds = ['INBOX'], type = 'message') => ({
  id,
  type,
  timestamp: at(minutesAgo),
  labelIds
});
const conv = (id: string, ...items: ReturnType<typeof msg>[]) => ({ id, items });
const one = (id: string, minutesAgo: number) => conv(id, msg(`${id}-m`, minutesAgo));
// The folder listing: its 3 newest messages (10, 20, 30 min ago), more after.
const listed = [
  { id: 'a-m', timestamp: at(10) },
  { id: 'b-m', timestamp: at(20) },
  { id: 'c-m', timestamp: at(30) }
];
const page = [one('a', 10), one('b', 20), one('c', 30)];
const run = (
  shown: ReturnType<typeof conv>[],
  over: Partial<Parameters<typeof leftFolder>[0]> = {}
) => leftFolder({ shown, listed, complete: false, folderLabel: 'INBOX', startedAt: NOW, ...over });

test('archived in Outlook, newer than the oldest listed: leaves the Inbox', () => {
  assert.deepEqual(run([...page, one('archived', 15)]), [
    { threadId: 'archived', messageIds: ['archived-m'], emptied: true }
  ]);
});

test('older than the listing: may simply be further down, so it stays', () => {
  assert.deepEqual(run([...page, one('older', 45)]), []);
  // A tie with the oldest listed message may be just past the listing.
  assert.deepEqual(run([one('tie', 30)]), []);
});

test('the whole folder listed: anything else has left it', () => {
  assert.deepEqual(
    run([...page, one('older', 45)], { complete: true }).map((r) => r.threadId),
    ['older']
  );
  // Inbox zero in Outlook empties the app's Inbox too.
  assert.deepEqual(
    run([one('a', 10)], { listed: [], complete: true }).map((r) => r.threadId),
    ['a']
  );
});

test('mail that arrived after the server read the folder is not judged', () => {
  assert.deepEqual(run([...page, one('new', -1)]), []);
  const recent = conv('recent', {
    id: 'r',
    type: 'message',
    timestamp: NOW - CLOCK_MARGIN_MS / 2,
    labelIds: ['INBOX']
  });
  assert.deepEqual(run([recent], { listed: [], complete: true }), []);
});

test('each message on its own: an older Inbox message below the listing keeps it', () => {
  // m2 (15 min ago) was archived; m1 (60 min ago) can't be judged.
  const r = run([conv('t', msg('m1', 60), msg('m2', 15))]);
  assert.deepEqual(r, [{ threadId: 't', messageIds: ['m2'], emptied: false }]);
  // A listed conversation whose other recent message left the Inbox.
  const listedToo = run([conv('a', msg('a-m', 10), msg('a-old', 25))]);
  assert.deepEqual(listedToo, [{ threadId: 'a', messageIds: ['a-old'], emptied: false }]);
});

test('your own replies and drafts are never "in the Inbox"', () => {
  // "Move to Inbox" labels the whole conversation here, Sent reply included.
  const replied = conv('replied', msg('in', 45), msg('out', 5, ['SENT', 'INBOX']));
  assert.deepEqual(run([replied]), []);
  const draft = conv('d', msg('d1', 15, ['INBOX'], 'draft'));
  assert.deepEqual(run([draft]), []);
  const sentOnly = conv('x', msg('x1', 15, ['SENT']));
  assert.deepEqual(run([sentOnly]), []);
});

test('changed here moments ago: left alone', () => {
  assert.deepEqual(run([one('moved-back', 15)], { isProtected: (id) => id === 'moved-back' }), []);
});

test('part of a folder with nothing listed: nothing is judged', () => {
  assert.deepEqual(run([one('a', 10)], { listed: [], complete: false }), []);
});
