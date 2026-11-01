import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  neighbourAfterLeaving,
  stepConversation
} from '@/renderer/app/lib/commands/readerNavigation';

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

// J / K (and ↓ / ↑) in the reader.
test('readerNavigation: J opens the conversation below, K the one above', () => {
  assert.equal(stepConversation(ids, 'b', 1), 'c');
  assert.equal(stepConversation(ids, 'b', -1), 'a');
});

test('readerNavigation: no wrapping at either end of the list', () => {
  assert.equal(stepConversation(ids, 'c', 1), null);
  assert.equal(stepConversation(ids, 'a', -1), null);
});

test('readerNavigation: with nothing open (or the open one gone) a step opens the first', () => {
  assert.equal(stepConversation(ids, null, 1), 'a');
  assert.equal(stepConversation(ids, 'zzz', -1), 'a');
  assert.equal(stepConversation([], 'a', 1), null);
});
