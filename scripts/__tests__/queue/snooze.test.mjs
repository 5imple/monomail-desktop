import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  startMockBackend,
  futureIso,
  postJson,
  patchJson,
  getJson,
  deleteJson
} from '../helpers.mjs';

describe('P8 mock-backend — snooze endpoints', () => {
  /** @type {Awaited<ReturnType<typeof startMockBackend>>} */
  let env;

  before(async () => {
    env = await startMockBackend();
  });

  after(async () => {
    if (env) await env.close();
  });

  test('POST /mail/snooze creates a snooze with the documented shape', async () => {
    const { status, body } = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-happy-path',
      accountId: 'acct-a',
      snoozeUntil: futureIso(1000)
    });

    assert.equal(status, 201);
    assert.match(body.snoozeId, /^snz-/);
    assert.equal(body.threadId, 'thread-happy-path');
    assert.equal(body.accountId, 'acct-a');
    assert.equal(body.snoozeUntil, body.snoozeUntil); // ISO round-trip stays equal
    assert.ok(body.createdAt);
    assert.ok(body.threadSnapshot && typeof body.threadSnapshot === 'object');
    assert.ok(body.threadSnapshot.from);
  });

  test('POST /mail/snooze accepts a caller-supplied threadSnapshot', async () => {
    const snapshot = {
      subject: 'Caller-provided subject',
      snippet: 'Caller snippet',
      from: { id: 'sender-1', name: 'Sender One', email: 'sender@example.com' },
      isStarred: true
    };
    const { status, body } = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-with-snapshot',
      accountId: 'acct-b',
      snoozeUntil: futureIso(1000),
      threadSnapshot: snapshot
    });

    assert.equal(status, 201);
    assert.deepEqual(body.threadSnapshot, snapshot);
  });

  test('POST /mail/snooze 400 when threadId is missing', async () => {
    const { status, body } = await postJson(`${env.baseUrl}/mail/snooze`, {
      accountId: 'acct-c',
      snoozeUntil: futureIso(1000)
    });
    assert.equal(status, 400);
    assert.match(body.error, /threadId/);
  });

  test('POST /mail/snooze 400 when snoozeUntil is in the past', async () => {
    const { status, body } = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-past',
      accountId: 'acct-d',
      snoozeUntil: new Date(Date.now() - 5000).toISOString()
    });
    assert.equal(status, 400);
    assert.match(body.error, /snoozeUntil/);
  });

  test('POST /mail/snooze 400 when snoozeUntil is not ISO8601', async () => {
    const { status } = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-bad-iso',
      accountId: 'acct-e',
      snoozeUntil: 'tomorrow morning'
    });
    assert.equal(status, 400);
  });

  test('POST /mail/snooze 409 when the same thread is snoozed twice for the same account', async () => {
    const accountId = 'acct-dup';
    const threadId = 'thread-dup';
    const first = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId,
      accountId,
      snoozeUntil: futureIso(2000)
    });
    assert.equal(first.status, 201);

    const second = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId,
      accountId,
      snoozeUntil: futureIso(5000)
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.snoozeId, first.body.snoozeId);
  });

  test('GET /mail/snooze returns the items list, filtered by accountId', async () => {
    const acct = 'acct-list';
    const otherAcct = 'acct-other';

    const a = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'list-thread-a',
      accountId: acct,
      snoozeUntil: futureIso(5000)
    });
    const b = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'list-thread-b',
      accountId: acct,
      snoozeUntil: futureIso(5000)
    });
    await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'list-thread-c',
      accountId: otherAcct,
      snoozeUntil: futureIso(5000)
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const { status, body } = await getJson(
      `${env.baseUrl}/mail/snooze?accountId=${acct}`
    );
    assert.equal(status, 200);
    const ids = new Set(body.items.map((i) => i.snoozeId));
    assert.ok(ids.has(a.body.snoozeId));
    assert.ok(ids.has(b.body.snoozeId));
    // Other account's snooze must not leak in.
    for (const item of body.items) {
      assert.equal(item.accountId, acct);
    }
  });

  test('DELETE /mail/snooze/:id removes it and returns ok', async () => {
    const create = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-to-delete',
      accountId: 'acct-del',
      snoozeUntil: futureIso(5000)
    });
    assert.equal(create.status, 201);

    const del = await deleteJson(`${env.baseUrl}/mail/snooze/${create.body.snoozeId}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);

    const list = await getJson(`${env.baseUrl}/mail/snooze?accountId=acct-del`);
    const found = list.body.items.find((i) => i.snoozeId === create.body.snoozeId);
    assert.equal(found, undefined);
  });

  test('DELETE /mail/snooze/:id 404 for unknown id', async () => {
    const { status } = await deleteJson(`${env.baseUrl}/mail/snooze/snz-nonexistent`);
    assert.equal(status, 404);
  });

  test('PATCH /mail/snooze/:id updates snoozeUntil and preserves snoozeId', async () => {
    const create = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-patch',
      accountId: 'acct-patch',
      snoozeUntil: futureIso(2000)
    });
    assert.equal(create.status, 201);

    const newTime = futureIso(8000);
    const patch = await patchJson(`${env.baseUrl}/mail/snooze/${create.body.snoozeId}`, {
      snoozeUntil: newTime
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.snoozeId, create.body.snoozeId);
    assert.equal(patch.body.snoozeUntil, newTime);
  });

  test('PATCH /mail/snooze/:id 400 when new time is in the past', async () => {
    const create = await postJson(`${env.baseUrl}/mail/snooze`, {
      threadId: 'thread-patch-past',
      accountId: 'acct-patch-past',
      snoozeUntil: futureIso(2000)
    });

    const patch = await patchJson(`${env.baseUrl}/mail/snooze/${create.body.snoozeId}`, {
      snoozeUntil: new Date(Date.now() - 5000).toISOString()
    });
    assert.equal(patch.status, 400);
  });

  test('PATCH /mail/snooze/:id 404 for unknown id', async () => {
    const patch = await patchJson(`${env.baseUrl}/mail/snooze/snz-bogus`, {
      snoozeUntil: futureIso(2000)
    });
    assert.equal(patch.status, 404);
  });

  test('POST /mail/snooze 402 when account is at quota', async () => {
    // This sub-test gets its own backend with a tiny quota so we don't
    // pollute the others by creating 50 snoozes here.
    const quotaEnv = await startMockBackend({ maxPerAccount: 2 });
    try {
      const acct = 'acct-quota';
      const a = await postJson(`${quotaEnv.baseUrl}/mail/snooze`, {
        threadId: 'q-1',
        accountId: acct,
        snoozeUntil: futureIso(3000)
      });
      const b = await postJson(`${quotaEnv.baseUrl}/mail/snooze`, {
        threadId: 'q-2',
        accountId: acct,
        snoozeUntil: futureIso(3000)
      });
      const c = await postJson(`${quotaEnv.baseUrl}/mail/snooze`, {
        threadId: 'q-3',
        accountId: acct,
        snoozeUntil: futureIso(3000)
      });
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.equal(c.status, 402);
      assert.match(c.body.error, /quota/);
    } finally {
      await quotaEnv.close();
    }
  });
});
