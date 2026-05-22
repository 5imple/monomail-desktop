import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import {
  startMockBackend,
  futureIso,
  postJson,
  patchJson,
  deleteJson
} from '../helpers.mjs';

/**
 * Tests for the four queue push events:
 *   THREAD_UNSNOOZED  — fires on DELETE /mail/snooze/:id AND on tick when snoozeUntil ≤ now
 *   SCHEDULED_SENT    — fires on POST /mail/schedule/:id/send-now AND on tick when sendAt ≤ now
 *   SNOOZE_RESCHEDULED   — fires on PATCH /mail/snooze/:id
 *   SCHEDULE_RESCHEDULED — fires on PATCH /mail/schedule/:id
 *
 * Each test connects a WebSocket client to `/push/ws?token=…`, performs
 * the triggering action, and asserts the expected frame arrives within
 * a few seconds.
 */

/**
 * Connect a WS client + return helpers for collecting frames whose
 * `data.type` matches the expected set.
 */
async function connectClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const frames = [];
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws open timeout')), 3000);
    ws.once('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
  ws.on('message', (raw) => {
    try {
      const f = JSON.parse(raw.toString());
      frames.push(f);
    } catch {
      // ignore non-JSON
    }
  });

  async function waitFor(eventType, timeoutMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const f = frames.find((x) => x?.data?.type === eventType);
      if (f) return f.data;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(
      `Timed out waiting for ${eventType}. Got: ${frames
        .map((f) => f?.data?.type ?? f?.type ?? '?')
        .join(', ')}`
    );
  }

  return { ws, frames, waitFor, close: () => ws.close() };
}

describe('P8 mock-backend — push events', () => {
  test('DELETE /mail/snooze/:id broadcasts THREAD_UNSNOOZED', async () => {
    const env = await startMockBackend();
    try {
      const client = await connectClient(env.wsUrl);
      try {
        const created = await postJson(`${env.baseUrl}/mail/snooze`, {
          threadId: 'thread-unsnooze-trigger',
          accountId: 'acct-x',
          snoozeUntil: futureIso(10_000)
        });
        assert.equal(created.status, 201);

        await deleteJson(`${env.baseUrl}/mail/snooze/${created.body.snoozeId}`);
        const data = await client.waitFor('THREAD_UNSNOOZED');
        assert.equal(data.snoozeId, created.body.snoozeId);
      } finally {
        client.close();
      }
    } finally {
      await env.close();
    }
  });

  test('PATCH /mail/snooze/:id broadcasts SNOOZE_RESCHEDULED', async () => {
    const env = await startMockBackend();
    try {
      const client = await connectClient(env.wsUrl);
      try {
        const created = await postJson(`${env.baseUrl}/mail/snooze`, {
          threadId: 'thread-resnooze',
          accountId: 'acct-y',
          snoozeUntil: futureIso(2000)
        });
        assert.equal(created.status, 201);
        const newTime = futureIso(8000);
        await patchJson(`${env.baseUrl}/mail/snooze/${created.body.snoozeId}`, {
          snoozeUntil: newTime
        });
        const data = await client.waitFor('SNOOZE_RESCHEDULED');
        assert.equal(data.snoozeId, created.body.snoozeId);
        assert.equal(data.snoozeUntil, newTime);
      } finally {
        client.close();
      }
    } finally {
      await env.close();
    }
  });

  test('POST /mail/schedule/:id/send-now broadcasts SCHEDULED_SENT with messageId', async () => {
    const env = await startMockBackend();
    try {
      const client = await connectClient(env.wsUrl);
      try {
        const created = await postJson(`${env.baseUrl}/mail/schedule`, {
          draftId: 'draft-send-now-broadcast',
          accountId: 'acct-z',
          sendAt: futureIso(10_000)
        });
        assert.equal(created.status, 201);

        const send = await postJson(
          `${env.baseUrl}/mail/schedule/${created.body.scheduleId}/send-now`,
          {}
        );
        assert.equal(send.status, 200);

        const data = await client.waitFor('SCHEDULED_SENT');
        assert.equal(data.scheduleId, created.body.scheduleId);
        assert.equal(data.draftId, 'draft-send-now-broadcast');
        assert.match(data.messageId, /^msg-/);
      } finally {
        client.close();
      }
    } finally {
      await env.close();
    }
  });

  test('PATCH /mail/schedule/:id broadcasts SCHEDULE_RESCHEDULED', async () => {
    const env = await startMockBackend();
    try {
      const client = await connectClient(env.wsUrl);
      try {
        const created = await postJson(`${env.baseUrl}/mail/schedule`, {
          draftId: 'draft-reschedule',
          accountId: 'acct-w',
          sendAt: futureIso(2000)
        });
        assert.equal(created.status, 201);
        const newTime = futureIso(8000);
        await patchJson(`${env.baseUrl}/mail/schedule/${created.body.scheduleId}`, {
          sendAt: newTime
        });
        const data = await client.waitFor('SCHEDULE_RESCHEDULED');
        assert.equal(data.scheduleId, created.body.scheduleId);
        assert.equal(data.sendAt, newTime);
      } finally {
        client.close();
      }
    } finally {
      await env.close();
    }
  });

  test('Queue tick fires THREAD_UNSNOOZED when snoozeUntil ≤ now', async () => {
    // Tight timing window: 200ms min-future + 200ms tick. Snooze for
    // 300ms; the next tick (within 200ms) should fire after the time
    // passes (~500ms total).
    const env = await startMockBackend({ tickMs: 200, minFutureMs: 200 });
    try {
      const client = await connectClient(env.wsUrl);
      try {
        const created = await postJson(`${env.baseUrl}/mail/snooze`, {
          threadId: 'thread-auto-fire',
          accountId: 'acct-tick',
          snoozeUntil: futureIso(300)
        });
        assert.equal(created.status, 201);

        const data = await client.waitFor('THREAD_UNSNOOZED', 4000);
        assert.equal(data.snoozeId, created.body.snoozeId);
        assert.equal(data.threadId, 'thread-auto-fire');
      } finally {
        client.close();
      }
    } finally {
      await env.close();
    }
  });

  test('Queue tick fires SCHEDULED_SENT when sendAt ≤ now', async () => {
    const env = await startMockBackend({ tickMs: 200, minFutureMs: 200 });
    try {
      const client = await connectClient(env.wsUrl);
      try {
        const created = await postJson(`${env.baseUrl}/mail/schedule`, {
          draftId: 'draft-auto-fire',
          accountId: 'acct-tick',
          sendAt: futureIso(300)
        });
        assert.equal(created.status, 201);

        const data = await client.waitFor('SCHEDULED_SENT', 4000);
        assert.equal(data.scheduleId, created.body.scheduleId);
        assert.equal(data.draftId, 'draft-auto-fire');
        assert.match(data.messageId, /^msg-/);
      } finally {
        client.close();
      }
    } finally {
      await env.close();
    }
  });
});
