import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  microsoftMailProvider,
  getMicrosoftFolderDelta
} from '@/main/api/mail/providers/microsoftMailProvider';
// Resolved (via the runner's alias) to scripts/__tests__/m365/stubs/apiClient.mjs.
import {
  __setGraphHandler,
  __setBatchHandler,
  __getRequests,
  __reset
} from '@/main/api/apiClient';

// Integration tests: drive the REAL microsoftMailProvider against a stubbed
// graphApiClient/graphBatch (canned Graph responses + recorded requests). This
// exercises request-building, pagination, conversation grouping, folder-label
// resolution, mutation fan-out, send, and the delta state machine — the
// orchestration layer the pure-unit tests can't reach (plan A14 / Phase 16).
//
// Each test uses a DISTINCT uid because the provider caches the folder-label map
// per uid in module state.

beforeEach(() => __reset());

type GraphResp = unknown | ((url: string) => unknown);
function routeGraph(routes: Array<[RegExp, GraphResp]>) {
  __setGraphHandler(async (_m: string, url: string) => {
    for (const [re, resp] of routes) {
      if (re.test(url)) return typeof resp === 'function' ? (resp as (u: string) => unknown)(url) : resp;
    }
    throw { status: 404, data: { error: { code: 'notFound' } } };
  });
}

const okFolderMap = () =>
  __setBatchHandler(async () => ({
    ok: true,
    responses: [
      { id: '0', status: 200, body: { id: 'INBOX_ID' } },
      { id: '1', status: 200, body: { id: 'SENT_ID' } },
      { id: '2', status: 404 },
      { id: '3', status: 200, body: { id: 'TRASH_ID' } },
      { id: '4', status: 200, body: { id: 'JUNK_ID' } }
    ]
  }));

function msg(over: Record<string, unknown>) {
  return {
    parentFolderId: 'INBOX_ID',
    isRead: true,
    receivedDateTime: '2026-06-01T10:00:00Z',
    from: { emailAddress: { address: 'a@x.com' } },
    body: { contentType: 'text', content: '' },
    ...over
  };
}

test('getThreads: lists inbox, groups by conversation, sorts desc, resolves INBOX label, paginates', async () => {
  okFolderMap();
  routeGraph([
    [
      /\/me\/mailFolders\/inbox\/messages/,
      {
        value: [
          msg({ id: 'm1', conversationId: 'c1', receivedDateTime: '2026-06-01T10:00:00Z', isRead: false }),
          msg({ id: 'm2', conversationId: 'c1', receivedDateTime: '2026-06-01T11:00:00Z' }),
          msg({ id: 'm3', conversationId: 'c2', receivedDateTime: '2026-06-01T09:00:00Z' })
        ],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=NEXT'
      }
    ]
  ]);

  const res = await microsoftMailProvider.getThreads('uid-list', 'label:INBOX', undefined, '25');

  assert.equal(res.threads.length, 2); // c1 + c2
  assert.equal(res.threads[0].id, 'c1'); // c1's latest (11:00) > c2 (09:00)
  assert.equal(res.threads[1].id, 'c2');
  assert.ok(res.threads[0].labelIds.includes('INBOX')); // resolved from parentFolderId
  assert.match(String(res.nextPageToken), /skiptoken=NEXT/);

  const listReq = __getRequests().find((r) => /mailFolders\/inbox\/messages/.test(r.url ?? ''));
  assert.ok(listReq, 'expected an inbox list request');
  // URLSearchParams encodes `$` as %24, which Graph accepts — match either form.
  assert.match(listReq!.url, /(?:\$|%24)top=25/);
  assert.match(listReq!.url, /orderby=/); // no $filter ⇒ $orderby present
});

test('getThreads: is:unread adds $filter and OMITS $orderby (InefficientFilter guard)', async () => {
  okFolderMap();
  routeGraph([[/\/messages/, { value: [] }]]);

  await microsoftMailProvider.getThreads('uid-filter', 'label:INBOX is:unread', undefined, '25');

  const listReq = __getRequests().find((r) => /mailFolders\/inbox\/messages/.test(r.url ?? ''));
  assert.ok(listReq);
  assert.match(listReq!.url, /isRead/); // $filter present (URLSearchParams encodes the spaces)
  assert.ok(!/orderby/.test(listReq!.url), 'orderby must be omitted when filtering');
});

test('getThreads: an @odata.nextLink continuation re-derives INBOX from the link path', async () => {
  okFolderMap();
  routeGraph([
    [
      /skiptoken=PAGE2/,
      { value: [msg({ id: 'mx', conversationId: 'cx', parentFolderId: 'UNKNOWN_FID' })] }
    ]
  ]);
  const next = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=PAGE2';

  const res = await microsoftMailProvider.getThreads('uid-cont', 'label:INBOX', next, '25');
  // parentFolderId UNKNOWN_FID isn't in the map, but the continuation URL path
  // (/mailFolders/inbox/) recovers the INBOX label.
  assert.ok(res.threads[0].labelIds.includes('INBOX'));
});

test('getThread: filters by conversationId, pages all messages, resolves labels', async () => {
  okFolderMap();
  routeGraph([
    [
      /skiptoken=P2/,
      { value: [msg({ id: 'b', conversationId: 'conv', receivedDateTime: '2026-06-01T12:00:00Z' })] }
    ],
    [
      /conversationId/,
      {
        value: [msg({ id: 'a', conversationId: 'conv', receivedDateTime: '2026-06-01T10:00:00Z' })],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=P2'
      }
    ]
  ]);

  const thread = await microsoftMailProvider.getThread('uid-thread', 'conv');
  assert.equal(thread.id, 'conv');
  assert.equal(thread.items.length, 2); // both pages collected
  assert.ok(thread.labelIds.includes('INBOX'));
  // conversationId filter present; no $orderby (combining trips Graph's sort guard)
  const req = __getRequests().find((r) => /conversationId/.test(r.url ?? ''));
  assert.ok(!/orderby/.test(req!.url));
});

test('getThread: empty conversation throws not-found (Gmail 404 parity)', async () => {
  okFolderMap();
  routeGraph([[/conversationId/, { value: [] }]]);
  await assert.rejects(() => microsoftMailProvider.getThread('uid-empty', 'gone'), /not found/i);
});

test('modifyThread: mark-read fans out PATCH isRead:true to every conversation message', async () => {
  routeGraph([[/\/me\/messages\?.*conversationId/, { value: [{ id: 'm1' }, { id: 'm2' }] }]]);
  let captured: any[] = [];
  __setBatchHandler(async (_uid: string, reqs: any[]) => {
    captured = reqs;
    return { ok: true, responses: reqs.map((r) => ({ id: r.id, status: 200 })) };
  });

  await microsoftMailProvider.modifyThread('uid-mod', 'conv1', [], ['UNREAD']);
  assert.equal(captured.length, 2);
  for (const op of captured) {
    assert.equal(op.method, 'PATCH');
    assert.deepEqual(op.body, { isRead: true });
    assert.match(op.url, /^\/me\/messages\//);
  }
});

test('trashThread: moves every conversation message to deleteditems', async () => {
  routeGraph([[/conversationId/, { value: [{ id: 'm1' }] }]]);
  let captured: any[] = [];
  __setBatchHandler(async (_uid: string, reqs: any[]) => {
    captured = reqs;
    return { ok: true, responses: reqs.map((r) => ({ id: r.id, status: 201 })) };
  });

  await microsoftMailProvider.trashThread('uid-trash', 'conv1');
  assert.equal(captured[0].method, 'POST');
  assert.match(captured[0].url, /\/move$/);
  assert.deepEqual(captured[0].body, { destinationId: 'deleteditems' });
});

test('sendMessage: POSTs the padded base64 MIME to /me/sendMail as text/plain', async () => {
  let captured: any;
  __setGraphHandler(async (method: string, url: string, opts: any, body: unknown) => {
    captured = { method, url, opts, body };
    return ''; // 202 no-body
  });

  const sent = await microsoftMailProvider.sendMessage('uid-send', 'aGVsbG8'); // base64url 'hello'
  assert.equal(captured.method, 'POST');
  assert.match(captured.url, /\/me\/sendMail$/);
  assert.equal(captured.opts.headers['Content-Type'], 'text/plain');
  assert.equal(captured.body, 'aGVsbG8='); // base64url → padded standard base64
  assert.deepEqual(sent, { id: '', threadId: '' });
});

test('getMicrosoftFolderDelta: ok path pages to the deltaLink, splitting upserts/removed', async () => {
  __setGraphHandler(async (_m: string, url: string) => {
    if (/\/messages\/delta/.test(url) && !/skiptoken/.test(url)) {
      return {
        value: [{ id: 'a' }, { id: 'b', '@removed': { reason: 'deleted' } }],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$skiptoken=P2'
      };
    }
    if (/skiptoken=P2/.test(url)) {
      return {
        value: [{ id: 'c' }],
        '@odata.deltaLink':
          'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=D1'
      };
    }
    throw { status: 404, data: {} };
  });

  const r = await getMicrosoftFolderDelta('uid-delta', 'inbox');
  assert.equal(r.status, 'ok');
  assert.deepEqual(
    r.upserts.map((m) => m.id),
    ['a', 'c']
  );
  assert.deepEqual(r.removedIds, ['b']);
  assert.match(String(r.deltaLink), /deltatoken=D1/);
});

test('getMicrosoftFolderDelta: syncStateNotFound (4xx) → reset + null cursor', async () => {
  __setGraphHandler(async () => {
    throw { status: 400, data: { error: { code: 'syncStateNotFound' } } };
  });
  const r = await getMicrosoftFolderDelta(
    'uid-reset',
    'inbox',
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=OLD'
  );
  assert.equal(r.status, 'reset');
  assert.equal(r.deltaLink, null);
});

test('getMicrosoftFolderDelta: 429 → retry, keeps the prior cursor', async () => {
  __setGraphHandler(async () => {
    throw { status: 429, data: {} };
  });
  const prior = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=KEEP';
  const r = await getMicrosoftFolderDelta('uid-retry', 'inbox', prior);
  assert.equal(r.status, 'retry');
  assert.equal(r.deltaLink, prior);
});
