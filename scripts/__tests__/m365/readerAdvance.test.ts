import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceAfterLeaving,
  nearLoadedEnd,
  resolvePendingAdvance,
  type PendingAdvance
} from '@/renderer/app/lib/commands/readerNavigation';

// Done / Trash / Later on the last loaded email keep going into the next page.

test('the email below when there is one; wait at the end while more can load', () => {
  assert.deepEqual(advanceAfterLeaving(['a', 'b', 'c'], 'b', true), { open: 'c' });
  assert.equal(advanceAfterLeaving(['a', 'b', 'c'], 'c', true), 'wait');
  // Nothing more on the server: the one above, as before.
  assert.deepEqual(advanceAfterLeaving(['a', 'b', 'c'], 'c', false), { open: 'b' });
  assert.deepEqual(advanceAfterLeaving(['c'], 'c', false), { open: null });
  assert.equal(advanceAfterLeaving(['c'], 'c', true), 'wait');
  assert.deepEqual(advanceAfterLeaving(['a'], 'x', true), { open: null });
});

const pending = (over: Partial<PendingAdvance> = {}): PendingAdvance => ({
  leavingId: 'c',
  after: 'b',
  leavingListed: false,
  ...over
});

test('the next page lands: the first email after the one above', () => {
  assert.equal(resolvePendingAdvance(['a', 'b'], pending(), 'c', true), 'wait');
  assert.deepEqual(resolvePendingAdvance(['a', 'b', 'd', 'e'], pending(), 'c', true), {
    open: 'd'
  });
  // New mail arriving at the top doesn't count as "the next one".
  assert.equal(resolvePendingAdvance(['n', 'a', 'b'], pending(), 'c', true), 'wait');
  // It was the only email loaded.
  assert.deepEqual(resolvePendingAdvance(['d', 'e'], pending({ after: null }), 'c', true), {
    open: 'd'
  });
});

test('nothing more to load: back to the one above', () => {
  assert.deepEqual(resolvePendingAdvance(['a', 'b'], pending(), 'c', false), { open: 'b' });
  assert.deepEqual(resolvePendingAdvance([], pending({ after: null }), 'c', false), {
    open: null
  });
  // The one above left too (archived elsewhere): the last one listed.
  assert.deepEqual(resolvePendingAdvance(['a'], pending(), 'c', false), { open: 'a' });
});

test('the wait ends when you move elsewhere or Undo brings the email back', () => {
  assert.equal(resolvePendingAdvance(['a', 'b'], pending(), 'a', true), 'cancel');
  assert.equal(resolvePendingAdvance(['a', 'b', 'c'], pending(), 'c', true), 'cancel');
  // An action that leaves it listed (Later outside the Inbox): skip over it.
  assert.deepEqual(
    resolvePendingAdvance(['a', 'b', 'c', 'd'], pending({ leavingListed: true }), 'c', true),
    { open: 'd' }
  );
});

test('fetch ahead within the last few emails', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(nearLoadedEnd(ids, 'b'), false);
  assert.equal(nearLoadedEnd(ids, 'c'), true);
  assert.equal(nearLoadedEnd(ids, 'f'), true);
  assert.equal(nearLoadedEnd(ids, 'x'), false);
  assert.equal(nearLoadedEnd(ids, null), false);
});
