import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbourAfterLeaving } from '@/renderer/app/lib/commands/readerNavigation';

// Done from the reader: which conversation it shows next.
const ids = ['a', 'b', 'c'];

test('readerNavigation: the next conversation down follows the one archived', () => {
  assert.equal(neighbourAfterLeaving(ids, 'a'), 'b');
  assert.equal(neighbourAfterLeaving(ids, 'b'), 'c');
});

test('readerNavigation: at the end of the list the reader steps back up', () => {
  assert.equal(neighbourAfterLeaving(ids, 'c'), 'b');
});

test('readerNavigation: nothing follows the only conversation, or one not in the list', () => {
  assert.equal(neighbourAfterLeaving(['a'], 'a'), null);
  assert.equal(neighbourAfterLeaving(ids, 'zzz'), null);
  assert.equal(neighbourAfterLeaving([], 'a'), null);
});
