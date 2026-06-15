import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MailDeltaFrame,
  POLL_INTERVAL_MS,
  diffPolledAccounts,
  nextPollDelay,
  splitDelta,
  synthesizeDeltaFrames
} from '@/main/services/push/mailDeltaFrames';
import type { GraphDeltaItem, GraphMessage } from '@/main/api/mail/graphTransforms';

const MAX_BACKOFF_MS = 5 * 60_000;

function msg(over: Partial<GraphMessage> = {}): GraphMessage {
  return { id: 'm1', conversationId: 'c1', isRead: false, subject: 'Hi', ...over };
}

function added(frames: MailDeltaFrame[]) {
  return frames.filter((f) => f.data?.type === 'MESSAGE_ADDED');
}
function deleted(frames: MailDeltaFrame[]) {
  return frames.filter((f) => f.data?.type === 'MESSAGE_DELETED');
}

// ── splitDelta ────────────────────────────────────────────────────────────────

test('splitDelta: separates upserts from @removed tombstones', () => {
  const value: GraphDeltaItem[] = [
    msg({ id: 'a' }),
    { id: 'b', '@removed': { reason: 'deleted' } },
    msg({ id: 'c' })
  ];
  const { upserts, removedIds } = splitDelta(value);
  assert.deepEqual(
    upserts.map((m) => m.id),
    ['a', 'c']
  );
  assert.deepEqual(removedIds, ['b']);
});

test('splitDelta: skips entries with no id, tolerates undefined', () => {
  assert.deepEqual(splitDelta(undefined), { upserts: [], removedIds: [] });
  const { upserts, removedIds } = splitDelta([
    { '@removed': { reason: 'deleted' } } as GraphDeltaItem,
    { conversationId: 'x' } as GraphDeltaItem
  ]);
  assert.deepEqual(upserts, []);
  assert.deepEqual(removedIds, []);
});

// ── synthesizeDeltaFrames ──────────────────────────────────────────────────────

test('synthesizeDeltaFrames: unread inbox upsert → MESSAGE_ADDED with INBOX+UNREAD', () => {
  const frames = synthesizeDeltaFrames(
    'uid-1',
    'inbox',
    [msg({ id: 'm9', conversationId: 'conv9', isRead: false, subject: 'Quarterly', from: { emailAddress: { name: 'Dana', address: 'dana@x.com' } } })],
    []
  );
  assert.equal(frames.length, 1);
  const f = frames[0];
  assert.equal(f.data?.type, 'MESSAGE_ADDED');
  assert.equal(f.data?.aAUid, 'uid-1');
  assert.equal(f.data?.id, 'm9');
  assert.equal(f.data?.threadId, 'conv9');
  assert.equal((f.data as { labels: string }).labels, '[INBOX, UNREAD]');
  assert.equal((f.data as { verification: string }).verification, 'false');
  assert.equal(f.notification?.title, 'Dana');
  assert.equal(f.notification?.body, 'Quarterly');
});

test('synthesizeDeltaFrames: read upsert omits UNREAD', () => {
  const frames = synthesizeDeltaFrames('uid-1', 'inbox', [msg({ isRead: true })], []);
  assert.equal((frames[0].data as { labels: string }).labels, '[INBOX]');
});

test('synthesizeDeltaFrames: threadId falls back to message id when no conversationId', () => {
  const frames = synthesizeDeltaFrames('uid-1', 'inbox', [msg({ id: 'solo', conversationId: undefined })], []);
  assert.equal(frames[0].data?.threadId, 'solo');
});

test('synthesizeDeltaFrames: notification title falls back address → "New email"', () => {
  const onlyAddress = synthesizeDeltaFrames('u', 'inbox', [msg({ from: { emailAddress: { address: 'a@b.com' } } })], []);
  assert.equal(onlyAddress[0].notification?.title, 'a@b.com');
  const noFrom = synthesizeDeltaFrames('u', 'inbox', [msg({ from: undefined, sender: undefined })], []);
  assert.equal(noFrom[0].notification?.title, 'New email');
});

test('synthesizeDeltaFrames: removed id → MESSAGE_DELETED with empty threadId and no notification', () => {
  const frames = synthesizeDeltaFrames('uid-1', 'inbox', [], ['gone-1']);
  assert.equal(frames.length, 1);
  const f = frames[0];
  assert.equal(f.data?.type, 'MESSAGE_DELETED');
  assert.equal(f.data?.id, 'gone-1');
  assert.equal(f.data?.threadId, '');
  assert.equal(f.notification, undefined);
});

test('synthesizeDeltaFrames: mixed page yields both frame kinds; empty page yields none', () => {
  const frames = synthesizeDeltaFrames('u', 'inbox', [msg({ id: 'a' }), msg({ id: 'b' })], ['x']);
  assert.equal(added(frames).length, 2);
  assert.equal(deleted(frames).length, 1);
  assert.deepEqual(synthesizeDeltaFrames('u', 'inbox', [], []), []);
});

// ── diffPolledAccounts (the feedback-loop guard) ───────────────────────────────

test('diffPolledAccounts: unchanged set → nothing to start/stop (no re-poll on token refresh)', () => {
  const same = ['microsoft:t:a', 'microsoft:t:b'];
  assert.deepEqual(diffPolledAccounts(same, same), { toStart: [], toStop: [] });
  // order-insensitive
  assert.deepEqual(diffPolledAccounts(['a', 'b'], ['b', 'a']), { toStart: [], toStop: [] });
});

test('diffPolledAccounts: added account → toStart; removed account → toStop', () => {
  assert.deepEqual(diffPolledAccounts(['a', 'b'], ['a']), { toStart: ['b'], toStop: [] });
  assert.deepEqual(diffPolledAccounts(['a'], ['a', 'b']), { toStart: [], toStop: ['b'] });
  assert.deepEqual(diffPolledAccounts(['a', 'c'], ['a', 'b']), { toStart: ['c'], toStop: ['b'] });
});

test('diffPolledAccounts: empty desired (signed out) stops everything', () => {
  assert.deepEqual(diffPolledAccounts([], ['a', 'b']), { toStart: [], toStop: ['a', 'b'] });
});

// ── nextPollDelay ──────────────────────────────────────────────────────────────

test('nextPollDelay: ok / reset resume the base cadence', () => {
  assert.equal(nextPollDelay('ok', 0, 5), POLL_INTERVAL_MS);
  assert.equal(nextPollDelay('reset', 0, 5), POLL_INTERVAL_MS);
});

test('nextPollDelay: retry honors Retry-After, floored at the base interval and capped', () => {
  assert.equal(nextPollDelay('retry', 5_000, 1), POLL_INTERVAL_MS); // floored
  assert.equal(nextPollDelay('retry', 120_000, 1), 120_000); // honored
  assert.equal(nextPollDelay('retry', 999_999, 1), MAX_BACKOFF_MS); // capped
});

test('nextPollDelay: transient/auth failures back off exponentially, capped', () => {
  assert.equal(nextPollDelay('error', 0, 1), 120_000);
  assert.equal(nextPollDelay('error', 0, 2), 240_000);
  assert.equal(nextPollDelay('error', 0, 3), MAX_BACKOFF_MS); // 480k capped to 300k
  assert.equal(nextPollDelay('expired', 0, 10), MAX_BACKOFF_MS); // exponent clamped
});
