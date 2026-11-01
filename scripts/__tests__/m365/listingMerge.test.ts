import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeListing } from '@/renderer/app/lib/listingMerge';

// A quiet refresh never shrinks a conversation that's already loaded.

const thread = (ids: [string, number][], labelIds: string[], snippet = 's') => ({
  items: ids.map(([id, timestamp]) => ({ id, timestamp })),
  labelIds,
  timestamp: Math.max(...ids.map(([, t]) => t)),
  snippet
});

test('a conversation not loaded yet is added as listed', () => {
  const listing = thread([['m1', 1]], ['INBOX']);
  assert.equal(mergeListing(undefined, listing), listing);
});

test('the Inbox-only listing does not drop your replies in Sent', () => {
  const loaded = thread(
    [
      ['in1', 1],
      ['sent1', 2],
      ['in2', 3],
      ['sent2', 4]
    ],
    ['INBOX', 'SENT']
  );
  const listing = thread(
    [
      ['in1', 1],
      ['in2', 3]
    ],
    ['INBOX']
  );
  assert.equal(mergeListing(loaded, listing), null);
});

test('a new message is added to the loaded conversation, keeping the rest', () => {
  const loaded = thread(
    [
      ['in1', 1],
      ['sent1', 2]
    ],
    ['INBOX', 'SENT'],
    'old'
  );
  const listing = thread(
    [
      ['in1', 1],
      ['in3', 5]
    ],
    ['INBOX', 'UNREAD'],
    'new'
  );
  const merged = mergeListing(loaded, listing)!;
  assert.deepEqual(
    merged.items.map((item) => item.id),
    ['in1', 'sent1', 'in3']
  );
  assert.deepEqual(merged.labelIds.sort(), ['INBOX', 'SENT', 'UNREAD']);
  assert.equal(merged.timestamp, 5);
  assert.equal(merged.snippet, 'new');
});
