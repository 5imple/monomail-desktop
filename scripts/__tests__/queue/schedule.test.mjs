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

describe('P8 mock-backend — schedule endpoints', () => {
  /** @type {Awaited<ReturnType<typeof startMockBackend>>} */
  let env;

  before(async () => {
    env = await startMockBackend();
  });

  after(async () => {
    if (env) await env.close();
  });

  test('POST /mail/schedule creates a scheduled send with the documented shape', async () => {
    const { status, body } = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-happy',
      accountId: 'acct-a',
      sendAt: futureIso(1000)
    });

    assert.equal(status, 201);
    assert.match(body.scheduleId, /^sch-/);
    assert.equal(body.draftId, 'draft-happy');
    assert.equal(body.accountId, 'acct-a');
    assert.ok(body.sendAt);
    assert.ok(body.createdAt);
    assert.ok(body.draftSnapshot && typeof body.draftSnapshot === 'object');
    assert.ok(Array.isArray(body.draftSnapshot.recipients));
  });

  test('POST /mail/schedule accepts a caller-supplied draftSnapshot', async () => {
    const snapshot = {
      subject: 'Follow-up',
      bodySnippet: 'Just checking in on the proposal.',
      recipients: [{ id: 'r-1', name: 'Recipient One', email: 'r1@example.com' }],
      attachmentCount: 2,
      isReply: true
    };
    const { status, body } = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-with-snapshot',
      accountId: 'acct-b',
      sendAt: futureIso(2000),
      draftSnapshot: snapshot
    });

    assert.equal(status, 201);
    assert.deepEqual(body.draftSnapshot, snapshot);
  });

  test('POST /mail/schedule 400 when draftId is missing', async () => {
    const { status } = await postJson(`${env.baseUrl}/mail/schedule`, {
      accountId: 'acct-c',
      sendAt: futureIso(1000)
    });
    assert.equal(status, 400);
  });

  test('POST /mail/schedule 400 when accountId is missing', async () => {
    const { status } = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-no-acct',
      sendAt: futureIso(1000)
    });
    assert.equal(status, 400);
  });

  test('POST /mail/schedule 400 when sendAt is in the past', async () => {
    const { status, body } = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-past',
      accountId: 'acct-past',
      sendAt: new Date(Date.now() - 5000).toISOString()
    });
    assert.equal(status, 400);
    assert.match(body.error, /sendAt/);
  });

  test('GET /mail/schedule returns scheduled drafts, filtered by accountId', async () => {
    const acct = 'acct-list';
    const a = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'list-draft-a',
      accountId: acct,
      sendAt: futureIso(5000)
    });
    const b = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'list-draft-b',
      accountId: acct,
      sendAt: futureIso(5000)
    });
    await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'list-draft-c',
      accountId: 'acct-other',
      sendAt: futureIso(5000)
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const { status, body } = await getJson(
      `${env.baseUrl}/mail/schedule?accountId=${acct}`
    );
    assert.equal(status, 200);
    const ids = new Set(body.items.map((i) => i.scheduleId));
    assert.ok(ids.has(a.body.scheduleId));
    assert.ok(ids.has(b.body.scheduleId));
    for (const item of body.items) {
      assert.equal(item.accountId, acct);
    }
  });

  test('DELETE /mail/schedule/:id removes it and returns ok', async () => {
    const create = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-del',
      accountId: 'acct-del',
      sendAt: futureIso(5000)
    });
    assert.equal(create.status, 201);

    const del = await deleteJson(
      `${env.baseUrl}/mail/schedule/${create.body.scheduleId}`
    );
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);

    const list = await getJson(`${env.baseUrl}/mail/schedule?accountId=acct-del`);
    assert.equal(
      list.body.items.find((i) => i.scheduleId === create.body.scheduleId),
      undefined
    );
  });

  test('DELETE /mail/schedule/:id 404 for unknown id', async () => {
    const { status } = await deleteJson(`${env.baseUrl}/mail/schedule/sch-bogus`);
    assert.equal(status, 404);
  });

  test('PATCH /mail/schedule/:id updates sendAt and preserves scheduleId', async () => {
    const create = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-patch',
      accountId: 'acct-patch',
      sendAt: futureIso(2000)
    });
    assert.equal(create.status, 201);

    const newTime = futureIso(8000);
    const patch = await patchJson(
      `${env.baseUrl}/mail/schedule/${create.body.scheduleId}`,
      { sendAt: newTime }
    );
    assert.equal(patch.status, 200);
    assert.equal(patch.body.scheduleId, create.body.scheduleId);
    assert.equal(patch.body.sendAt, newTime);
  });

  test('PATCH /mail/schedule/:id 400 when new sendAt is in the past', async () => {
    const create = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-patch-past',
      accountId: 'acct-patch-past',
      sendAt: futureIso(2000)
    });

    const patch = await patchJson(
      `${env.baseUrl}/mail/schedule/${create.body.scheduleId}`,
      { sendAt: new Date(Date.now() - 5000).toISOString() }
    );
    assert.equal(patch.status, 400);
  });

  test('PATCH /mail/schedule/:id 404 for unknown id', async () => {
    const patch = await patchJson(`${env.baseUrl}/mail/schedule/sch-bogus`, {
      sendAt: futureIso(2000)
    });
    assert.equal(patch.status, 404);
  });

  test('POST /mail/schedule/:id/send-now returns 200 + messageId and removes the row', async () => {
    const create = await postJson(`${env.baseUrl}/mail/schedule`, {
      draftId: 'draft-send-now',
      accountId: 'acct-send-now',
      sendAt: futureIso(5000)
    });
    assert.equal(create.status, 201);

    const send = await postJson(
      `${env.baseUrl}/mail/schedule/${create.body.scheduleId}/send-now`,
      {}
    );
    assert.equal(send.status, 200);
    assert.equal(send.body.ok, true);
    assert.match(send.body.messageId, /^msg-/);

    // After send, the schedule no longer exists.
    const list = await getJson(`${env.baseUrl}/mail/schedule?accountId=acct-send-now`);
    assert.equal(
      list.body.items.find((i) => i.scheduleId === create.body.scheduleId),
      undefined
    );
  });

  test('POST /mail/schedule/:id/send-now 404 for unknown id', async () => {
    const { status } = await postJson(
      `${env.baseUrl}/mail/schedule/sch-bogus/send-now`,
      {}
    );
    assert.equal(status, 404);
  });

  test('POST /mail/schedule 402 when account is at quota', async () => {
    const quotaEnv = await startMockBackend({ maxPerAccount: 1 });
    try {
      const acct = 'acct-quota';
      const a = await postJson(`${quotaEnv.baseUrl}/mail/schedule`, {
        draftId: 'q-1',
        accountId: acct,
        sendAt: futureIso(3000)
      });
      const b = await postJson(`${quotaEnv.baseUrl}/mail/schedule`, {
        draftId: 'q-2',
        accountId: acct,
        sendAt: futureIso(3000)
      });
      assert.equal(a.status, 201);
      assert.equal(b.status, 402);
      assert.match(b.body.error, /quota/);
    } finally {
      await quotaEnv.close();
    }
  });
});
