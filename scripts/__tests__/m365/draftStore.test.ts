import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { mergeHydratedDrafts } from '@/renderer/app/store/draft/hydrateDrafts';
import {
  buildOptimisticSentMessage,
  optimisticSentId,
  reconcileSentItems,
  snippetFromHtml
} from '@/renderer/app/store/draft/optimisticSent';

// ── Drafts loaded from IndexedDB after a restart ──────────────────────────

test('mergeHydratedDrafts adds saved drafts under the in-memory ones', () => {
  const inMemory = new MonoDraft({ id: 'd1', subject: 'newer' });
  const current = { d1: inMemory };
  const merged = mergeHydratedDrafts(
    current,
    [new MonoDraft({ id: 'd1', subject: 'older' }), new MonoDraft({ id: 'd2', subject: 'saved' })],
    new Set()
  );
  assert.equal(merged.d1, inMemory);
  assert.equal(merged.d2.subject, 'saved');
});

test('mergeHydratedDrafts leaves out drafts removed or sending meanwhile', () => {
  const merged = mergeHydratedDrafts(
    {},
    [
      new MonoDraft({ id: 'gone' }),
      new MonoDraft({ id: 'sending' }),
      new MonoDraft({ id: 'kept' })
    ],
    new Set(['gone', 'sending'])
  );
  assert.deepEqual(Object.keys(merged), ['kept']);
});

test('mergeHydratedDrafts returns the same map when nothing is added', () => {
  const current = { d1: new MonoDraft({ id: 'd1' }) };
  assert.equal(mergeHydratedDrafts(current, [new MonoDraft({ id: 'd1' })], new Set()), current);
  assert.equal(mergeHydratedDrafts(current, [], new Set()), current);
});

// ── The sent reply shown before Microsoft lists it ─────────────────────────

const sentDraft = () =>
  new MonoDraft({
    id: 'draft-1',
    from: 'me@x.com',
    to: ['a@x.com'],
    cc: ['c@x.com'],
    subject: 'Re: Plan',
    body: '<html><body><p>Sounds good &amp; thanks</p><div data-history class="mono-history">old</div></body></html>'
  });

const message = (id: string, from: string, timestamp: number) =>
  new MonoMessage({
    id,
    threadId: 'conv-1',
    from: { name: '', email: from },
    timestamp,
    payload: {
      partId: '0',
      mimeType: 'text/html',
      fileName: '',
      body: { attachmentId: null, size: 0, data: '' }
    }
  });

test('buildOptimisticSentMessage carries the reply as a sent message', () => {
  const msg = buildOptimisticSentMessage(sentDraft(), 'conv-1', 1000);
  assert.equal(msg.id, optimisticSentId('draft-1'));
  assert.equal(msg.threadId, 'conv-1');
  assert.equal(msg.timestamp, 1000);
  assert.deepEqual(msg.labelIds, ['SENT']);
  assert.equal(msg.from.email, 'me@x.com');
  assert.deepEqual(
    msg.to.map((r) => r.email),
    ['a@x.com']
  );
  assert.deepEqual(
    msg.cc.map((r) => r.email),
    ['c@x.com']
  );
  assert.equal(msg.snippet, 'Sounds good & thanks');
  // The body travels as base64url, like a fetched message's.
  const decoded = Buffer.from(msg.payload.body.data!, 'base64url').toString('utf8');
  assert.equal(decoded, sentDraft().body);
});

test('snippetFromHtml leaves out quoted history and markup', () => {
  assert.equal(
    snippetFromHtml('<p>Hi&nbsp;there</p><div data-history>On Monday … wrote</div>'),
    'Hi there'
  );
});

test('reconcileSentItems waits until the sent copy is in the conversation', () => {
  const before = message('m1', 'boss@x.com', 1);
  const optimistic = buildOptimisticSentMessage(sentDraft(), 'conv-1', 5);
  const options = {
    optimisticId: optimistic.id,
    preSendIds: new Set(['m1']),
    senderEmail: 'me@x.com'
  };
  // Only someone else's new message so far: keep the stand-in.
  assert.equal(
    reconcileSentItems([before, optimistic], [before, message('m2', 'boss@x.com', 6)], options),
    null
  );
  // The sent copy arrived: the stand-in goes, new messages come in, oldest first.
  const items = reconcileSentItems(
    [before, optimistic],
    [before, message('m3', 'Me@X.com', 7), message('m2', 'boss@x.com', 6)],
    options
  );
  assert.deepEqual(
    items?.map((item) => item.id),
    ['m1', 'm2', 'm3']
  );
});

test('reconcileSentItems drops the stand-in when another sync already brought the copy', () => {
  const optimistic = buildOptimisticSentMessage(sentDraft(), 'conv-1', 5);
  const items = reconcileSentItems(
    [message('m1', 'boss@x.com', 1), optimistic, message('m9', 'me@x.com', 6)],
    [],
    {
      optimisticId: optimistic.id,
      preSendIds: new Set(['m1']),
      senderEmail: 'me@x.com'
    }
  );
  assert.deepEqual(
    items?.map((item) => item.id),
    ['m1', 'm9']
  );
});
