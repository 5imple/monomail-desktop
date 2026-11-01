import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickOpenMessages } from '@/renderer/app/lib/readerExpansion';
import { upgradeToVersion5 } from '@/renderer/app/lib/db/migrations/v5';

// Which messages a conversation opens on, and the one-time cache repair that
// lets an empty body count as fetched.

type Message = Parameters<typeof pickOpenMessages>[0][number];

const part = (data: string | null) => ({
  partId: '',
  mimeType: 'multipart/alternative',
  fileName: '',
  body: { attachmentId: null, size: 0, data: null },
  parts: [
    {
      partId: '1',
      mimeType: 'text/html',
      fileName: '',
      body: { attachmentId: null, size: 0, data }
    }
  ]
});

const message = (id: string, over: Partial<Message> = {}): Message => ({
  id,
  labelIds: ['INBOX'],
  snippet: `text of ${id}`,
  attachments: {},
  payload: part('PHA+aGk8L3A+'),
  ...over
});

// An Outlook "Accepted:" reply once fetched: no text, a meeting reply.
const acceptedReply = (id: string): Message => ({
  ...message(id),
  snippet: '',
  payload: part(''),
  meeting: { kind: 'accepted' } as Message['meeting']
});

test('pickOpenMessages: opens on the newest message, scrolled to', () => {
  const result = pickOpenMessages([message('a'), message('b'), message('c')]);
  assert.deepEqual([...result.expanded], ['c']);
  assert.equal(result.focusId, 'c');
});

test('pickOpenMessages: skips an empty meeting reply for the newest message with content', () => {
  const result = pickOpenMessages([message('a'), message('b'), acceptedReply('c')]);
  assert.deepEqual([...result.expanded], ['b']);
  assert.equal(result.focusId, 'b');
});

test('pickOpenMessages: also opens the newest unread message, and scrolls to it', () => {
  const unread = message('b', { labelIds: ['INBOX', 'UNREAD'] });
  const result = pickOpenMessages([message('a'), unread, message('c')]);
  assert.deepEqual([...result.expanded].sort(), ['b', 'c']);
  assert.equal(result.focusId, 'b');
});

test('pickOpenMessages: unread as of the open, not as of now', () => {
  // Opening marks the thread read; the message stays open.
  const result = pickOpenMessages([message('a'), message('b'), message('c')], new Set(['a']));
  assert.deepEqual([...result.expanded].sort(), ['a', 'c']);
  assert.equal(result.focusId, 'a');
});

test('pickOpenMessages: a message not fetched yet is chosen only when nothing has known content', () => {
  const unknown = message('c', { snippet: '', payload: part(null) });
  assert.equal(pickOpenMessages([message('a'), unknown]).focusId, 'a');
  assert.equal(pickOpenMessages([unknown]).focusId, 'c');
});

test('pickOpenMessages: all empty falls back to the newest; empty conversation to nothing', () => {
  const result = pickOpenMessages([acceptedReply('a'), acceptedReply('b')]);
  assert.deepEqual([...result.expanded], ['b']);
  assert.equal(result.focusId, 'b');
  const none = pickOpenMessages([]);
  assert.equal(none.expanded.size, 0);
  assert.equal(none.focusId, null);
});

// ── IndexedDB v5 ──────────────────────────────────────────────────────────────

// A cursor over an in-memory store, shaped like idb's.
function fakeTransaction(records: Array<Record<string, unknown>>) {
  const updates: Array<Record<string, unknown>> = [];
  const cursorAt = (index: number): unknown =>
    index >= records.length
      ? null
      : {
          value: records[index],
          update: (value: Record<string, unknown>) => {
            records[index] = value;
            updates.push(value);
          },
          continue: async () => cursorAt(index + 1)
        };
  return {
    updates,
    transaction: {
      objectStore: (name: string) => {
        assert.equal(name, 'messages');
        return { openCursor: async () => cursorAt(0) };
      }
    }
  };
}

test('IndexedDB v5: resets only stored messages whose body data is all ""', async () => {
  const records = [
    { id: 'legacy', payload: part('') }, // metadata-only copy from before 2026-10-27
    { id: 'full', payload: part('PHA+aGk8L3A+') },
    { id: 'listing', payload: part(null) }
  ];
  const { transaction, updates } = fakeTransaction(records);
  const reset = await upgradeToVersion5(transaction as never);
  assert.equal(reset, 1);
  assert.deepEqual(
    updates.map((record) => record.id),
    ['legacy']
  );
  const legacy = records[0] as { payload: ReturnType<typeof part> };
  assert.equal(legacy.payload.parts[0].body.data, null);
  assert.equal(
    (records[1] as { payload: ReturnType<typeof part> }).payload.parts[0].body.data,
    'PHA+aGk8L3A+'
  );
});

test('IndexedDB v5: an empty store (a new account) is fine', async () => {
  const { transaction } = fakeTransaction([]);
  assert.equal(await upgradeToVersion5(transaction as never), 0);
});
