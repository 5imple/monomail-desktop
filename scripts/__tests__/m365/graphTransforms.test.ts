import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformGraphMessage,
  transformGraphThread,
  wellKnownFolderToLabel,
  mapGraphMessageLabels,
  splitDeltaPage,
  buildFolderLabelMap
} from '@/main/api/mail/graphTransforms';

// The renderer's exact reverse of the synthetic payload encoding
// (src/main/models/message/utils.ts decodePayloadData) — replicated here so the
// round-trip is asserted against the real algorithm.
function decodePayloadData(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const decoded = atob(padded);
  return new TextDecoder('utf-8').decode(new Uint8Array([...decoded].map((c) => c.charCodeAt(0))));
}

const baseMsg = {
  id: 'AAMkImmutableId123',
  conversationId: 'CONV-abc',
  subject: 'Hello',
  bodyPreview: 'preview text',
  body: { contentType: 'html', content: '<p>Hello 世界 &amp; "friends"</p>' },
  from: { emailAddress: { name: 'Bob', address: 'bob@x.com' } },
  toRecipients: [{ emailAddress: { name: 'Me', address: 'me@x.com' } }],
  receivedDateTime: '2026-06-01T12:00:00Z',
  isRead: false,
  flag: { flagStatus: 'flagged' },
  parentFolderId: 'FOLDER1',
  categories: ['Red category'],
  attachments: [
    { id: 'att-inline', name: 'logo.png', contentType: 'image/png', size: 100, isInline: true, contentId: 'logo123' },
    { id: 'att-file', name: 'doc.pdf', contentType: 'application/pdf', size: 2000, isInline: false }
  ]
};

test('transformGraphMessage: immutable id is the primary key; conversationId is threadId', () => {
  const m = transformGraphMessage(baseMsg, { folderLabel: 'INBOX' });
  assert.equal(m.id, 'AAMkImmutableId123');
  assert.equal(m.threadId, 'CONV-abc');
  assert.equal(m.historyId, null);
});

test('transformGraphMessage: normalized label mapping', () => {
  const m = transformGraphMessage(baseMsg, { folderLabel: 'INBOX' });
  assert.ok(m.labelIds.includes('INBOX'));
  assert.ok(m.labelIds.includes('UNREAD'));
  assert.ok(m.labelIds.includes('STARRED'));
  assert.ok(m.labelIds.includes('folder:FOLDER1'));
  assert.ok(m.labelIds.includes('category:Red category'));
});

test('transformGraphMessage: from/to recipients', () => {
  const m = transformGraphMessage(baseMsg, {});
  assert.deepEqual(m.from, { name: 'Bob', email: 'bob@x.com' });
  assert.deepEqual(m.to, [{ name: 'Me', email: 'me@x.com' }]);
});

test('transformGraphMessage: synthetic HTML payload round-trips (UTF-8 safe)', () => {
  const m = transformGraphMessage(baseMsg, {});
  const htmlPart = (m.payload.parts ?? []).find((p) => p.mimeType === 'text/html');
  assert.ok(htmlPart, 'expected a text/html part');
  assert.equal(decodePayloadData(htmlPart!.body.data!), '<p>Hello 世界 &amp; "friends"</p>');
  assert.equal(m.bodyHtml, '<p>Hello 世界 &amp; "friends"</p>');
  assert.equal(m.bodyPlain, undefined);
});

test('transformGraphMessage: text body → text/plain part + bodyPlain', () => {
  const m = transformGraphMessage({ ...baseMsg, body: { contentType: 'text', content: 'plain ✓' } }, {});
  const part = (m.payload.parts ?? [])[0];
  assert.equal(part.mimeType, 'text/plain');
  assert.equal(decodePayloadData(part.body.data!), 'plain ✓');
  assert.equal(m.bodyPlain, 'plain ✓');
  assert.equal(m.bodyHtml, undefined);
});

test('transformGraphMessage: inline (isInline+cid) vs file attachment split', () => {
  const m = transformGraphMessage(baseMsg, {});
  assert.equal(m.inlineImages['logo123'].attachmentId, 'att-inline');
  assert.equal(m.attachments['doc.pdf'].attachmentId, 'att-file');
  assert.equal(m.inlineImageSize, 100);
  assert.equal(Object.keys(m.attachments).length, 1); // inline not double-counted
});

test('wellKnownFolderToLabel: names map (case-insensitive); archive/custom → null', () => {
  assert.equal(wellKnownFolderToLabel('inbox'), 'INBOX');
  assert.equal(wellKnownFolderToLabel('SentItems'), 'SENT');
  assert.equal(wellKnownFolderToLabel('drafts'), 'DRAFT');
  assert.equal(wellKnownFolderToLabel('deleteditems'), 'TRASH');
  assert.equal(wellKnownFolderToLabel('junkemail'), 'SPAM');
  assert.equal(wellKnownFolderToLabel('archive'), null);
  assert.equal(wellKnownFolderToLabel('customfolder'), null);
  assert.equal(wellKnownFolderToLabel(null), null);
});

test('transformGraphMessage: resolveFolderLabel derives the label from parentFolderId', () => {
  const resolver = (pid: string | undefined) => (pid === 'INBOX_FOLDER_ID' ? 'INBOX' : null);

  // Resolved from parentFolderId.
  const m = transformGraphMessage(
    { ...baseMsg, parentFolderId: 'INBOX_FOLDER_ID' },
    { resolveFolderLabel: resolver }
  );
  assert.ok(m.labelIds.includes('INBOX'));
  assert.ok(m.labelIds.includes('folder:INBOX_FOLDER_ID'));

  // Negative control: WITHOUT the resolver, INBOX is not derived — proving the
  // INBOX label above genuinely comes from the resolver, not from elsewhere.
  const noResolver = transformGraphMessage({ ...baseMsg, parentFolderId: 'INBOX_FOLDER_ID' }, {});
  assert.ok(!noResolver.labelIds.includes('INBOX'));

  // Resolver takes precedence over a (stale/wrong) single folderLabel.
  const m2 = transformGraphMessage(
    { ...baseMsg, parentFolderId: 'INBOX_FOLDER_ID' },
    { resolveFolderLabel: resolver, folderLabel: 'SENT' }
  );
  assert.ok(m2.labelIds.includes('INBOX'));
  assert.ok(!m2.labelIds.includes('SENT'));

  // Falls back to folderLabel when the resolver can't map the folder.
  const m3 = transformGraphMessage(
    { ...baseMsg, parentFolderId: 'UNKNOWN_ID' },
    { resolveFolderLabel: resolver, folderLabel: 'SENT' }
  );
  assert.ok(m3.labelIds.includes('SENT'));
});

test('mapGraphMessageLabels: read + unflagged message omits UNREAD/STARRED', () => {
  const labels = mapGraphMessageLabels(
    { id: 'x', isRead: true, parentFolderId: 'F' },
    null
  );
  assert.ok(!labels.includes('UNREAD'));
  assert.ok(!labels.includes('STARRED'));
  assert.ok(labels.includes('folder:F'));
});

test('transformGraphThread: groups + sorts ascending + id is conversationId', () => {
  const m1 = { ...baseMsg, id: 'id1', receivedDateTime: '2026-06-01T10:00:00Z' };
  const m2 = { ...baseMsg, id: 'id2', receivedDateTime: '2026-06-01T12:00:00Z' };
  const thread = transformGraphThread([m2, m1], 'uid-1', { folderLabel: 'INBOX' });
  assert.equal(thread.id, 'CONV-abc');
  assert.equal(thread.accountId, 'uid-1');
  assert.equal(thread.historyId, null);
  assert.equal(thread.items.length, 2);
  assert.equal((thread.items[0] as { id: string }).id, 'id1');
  assert.equal((thread.items[1] as { id: string }).id, 'id2');
});

test('buildFolderLabelMap: resolves folders; 404 is cacheable, transient failure is not', () => {
  const names = ['inbox', 'sentitems', 'drafts', 'deleteditems', 'junkemail'];
  const ok = buildFolderLabelMap(
    [
      { id: '0', status: 200, body: { id: 'INBOX_ID' } },
      { id: '1', status: 200, body: { id: 'SENT_ID' } },
      { id: '2', status: 404 }, // drafts not provisioned — still complete
      { id: '3', status: 200, body: { id: 'TRASH_ID' } },
      { id: '4', status: 200, body: { id: 'JUNK_ID' } }
    ],
    names
  );
  assert.equal(ok.complete, true);
  assert.equal(ok.map.get('INBOX_ID'), 'INBOX');
  assert.equal(ok.map.get('SENT_ID'), 'SENT');
  assert.equal(ok.map.get('TRASH_ID'), 'TRASH');
  assert.equal(ok.map.get('JUNK_ID'), 'SPAM');

  // A transient (5xx) failure → complete=false so the caller must NOT cache.
  const transient = buildFolderLabelMap(
    [
      { id: '0', status: 200, body: { id: 'INBOX_ID' } },
      { id: '1', status: 503 }
    ],
    ['inbox', 'sentitems']
  );
  assert.equal(transient.complete, false);
  assert.equal(transient.map.get('INBOX_ID'), 'INBOX');
});

test('splitDeltaPage: separates upserts from @removed tombstones', () => {
  const page = [
    { id: 'm1', subject: 'a' },
    { id: 'm2', '@removed': { reason: 'deleted' } },
    { id: 'm3', subject: 'c' },
    { id: 'm4', '@removed': { reason: 'changed' } },
    { subject: 'no-id-ignored' }
  ];
  const { upserts, removedIds } = splitDeltaPage(page);
  assert.deepEqual(
    upserts.map((m) => m.id),
    ['m1', 'm3']
  );
  assert.deepEqual(removedIds, ['m2', 'm4']);
  assert.deepEqual(splitDeltaPage(undefined), { upserts: [], removedIds: [] });
});

test('transformGraphThread: empty input → empty-id thread (documented edge case)', () => {
  const t = transformGraphThread([], 'uid-1', {});
  assert.equal(t.id, '');
  assert.equal(t.items.length, 0);
});

test('transformGraphMessage: missing/invalid date → timestamp 0 (not the current time)', () => {
  const noDate = transformGraphMessage({ id: 'x', body: { contentType: 'text', content: '' } }, {});
  assert.equal(noDate.timestamp, 0);
  const badDate = transformGraphMessage(
    { id: 'y', receivedDateTime: 'not-a-date', body: { contentType: 'text', content: '' } },
    {}
  );
  assert.equal(badDate.timestamp, 0);
  const good = transformGraphMessage(
    { id: 'z', receivedDateTime: '2026-06-01T12:00:00Z', body: { contentType: 'text', content: '' } },
    {}
  );
  assert.equal(good.timestamp, Date.parse('2026-06-01T12:00:00Z'));
});

test('transformGraphThread: aggregates recipients (dedup), attachments, subject/snippet/timestamp', () => {
  const a = {
    ...baseMsg,
    id: 'a',
    conversationId: 'C',
    receivedDateTime: '2026-06-01T10:00:00Z',
    subject: 'First subject',
    bodyPreview: 'first preview',
    from: { emailAddress: { name: 'Alice', address: 'alice@x.com' } },
    toRecipients: [{ emailAddress: { name: 'Me', address: 'me@x.com' } }],
    attachments: [{ id: 'att-a', name: 'a.pdf', contentType: 'application/pdf', size: 1, isInline: false }]
  };
  const b = {
    ...baseMsg,
    id: 'b',
    conversationId: 'C',
    receivedDateTime: '2026-06-01T12:00:00Z',
    subject: 'Second subject',
    bodyPreview: 'second preview',
    from: { emailAddress: { name: 'Alice', address: 'alice@x.com' } }, // duplicate sender
    toRecipients: [{ emailAddress: { name: 'Bob', address: 'bob@x.com' } }],
    attachments: [{ id: 'att-b', name: 'b.pdf', contentType: 'application/pdf', size: 2, isInline: false }]
  };
  const t = transformGraphThread([b, a], 'uid', {});
  assert.equal(t.subject, 'First subject'); // earliest message's subject
  assert.equal(t.snippet, 'second preview'); // latest message's preview
  assert.equal(t.timestamp, Date.parse('2026-06-01T12:00:00Z')); // latest
  assert.equal(t.from.length, 1); // Alice deduped
  assert.equal(t.from[0].email, 'alice@x.com');
  assert.deepEqual(new Set(t.to.map((r) => r.email)), new Set(['me@x.com', 'bob@x.com']));
  assert.ok(t.attachments['a.pdf'] && t.attachments['b.pdf']); // union
});
