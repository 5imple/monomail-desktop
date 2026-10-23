import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOCUS_POLL_MIN_GAP_MS,
  PollGate,
  synthesizeDeltaFrames
} from '@/main/services/push/mailDeltaFrames';
import type { GraphMessage } from '@/main/api/mail/graphTransforms';

function msg(over: Partial<GraphMessage> = {}): GraphMessage {
  return { id: 'm1', conversationId: 'c1', isRead: false, subject: 'Hi', ...over };
}

// ── receivedAt on synthesized frames ──────────────────────────────────────────

test('synthesizeDeltaFrames: carries receivedAt when Graph has receivedDateTime', () => {
  const frames = synthesizeDeltaFrames(
    'u',
    'inbox',
    [msg({ receivedDateTime: '2026-10-28T09:00:00Z' })],
    []
  );
  assert.equal((frames[0].data as { receivedAt?: string }).receivedAt, '2026-10-28T09:00:00Z');
});

test('synthesizeDeltaFrames: omits receivedAt when Graph has none (additive field)', () => {
  const frames = synthesizeDeltaFrames('u', 'inbox', [msg()], []);
  assert.equal('receivedAt' in (frames[0].data as object), false);
});

test('synthesizeDeltaFrames: a read upsert still reaches the renderer (frame kept, no UNREAD)', () => {
  const frames = synthesizeDeltaFrames('u', 'inbox', [msg({ isRead: true })], []);
  assert.equal(frames.length, 1);
  assert.equal((frames[0].data as { labels: string }).labels, '[INBOX]');
});

// ── PollGate (single flight + focus debounce) ─────────────────────────────────

test('PollGate: a second poll while one runs is refused, then runs exactly once after', () => {
  const gate = new PollGate();
  assert.equal(gate.begin('a', 1_000), true);
  // Boot poll in flight; the first window-focus poll lands 71 ms later.
  assert.equal(gate.begin('a', 1_071), false);
  assert.equal(gate.begin('a', 1_080), false); // several requests still mean one re-run
  assert.equal(gate.isInFlight('a'), true);
  assert.equal(gate.end('a'), true); // re-run requested
  assert.equal(gate.isInFlight('a'), false);
  assert.equal(gate.begin('a', 2_000), true);
  assert.equal(gate.end('a'), false); // nothing requested meanwhile
});

test('PollGate: accounts are independent', () => {
  const gate = new PollGate();
  assert.equal(gate.begin('a', 0), true);
  assert.equal(gate.begin('b', 0), true);
  assert.equal(gate.end('b'), false);
  assert.equal(gate.isInFlight('a'), true);
});

test('PollGate: focus polls skip in-flight accounts and ones polled moments ago', () => {
  const gate = new PollGate();
  assert.equal(gate.shouldPollOnFocus('a', 0), true); // never polled
  gate.begin('a', 10_000);
  assert.equal(gate.shouldPollOnFocus('a', 10_050), false); // in flight
  gate.end('a');
  assert.equal(gate.shouldPollOnFocus('a', 10_000 + FOCUS_POLL_MIN_GAP_MS - 1), false);
  assert.equal(gate.shouldPollOnFocus('a', 10_000 + FOCUS_POLL_MIN_GAP_MS), true);
});

test('PollGate: forget() drops a queued re-run and the focus debounce', () => {
  const gate = new PollGate();
  gate.begin('a', 10_000);
  gate.begin('a', 10_001); // queues a re-run
  gate.forget('a'); // account stopped (sign-out) while in flight
  assert.equal(gate.end('a'), false);
  assert.equal(gate.shouldPollOnFocus('a', 10_002), true);
});
