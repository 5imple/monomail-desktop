import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformGraphMessage,
  transformGraphThread,
  wellKnownFolderToLabel,
  mapGraphMessageLabels
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

test('transformGraphThread: empty input → empty-id thread (documented edge case)', () => {
  const t = transformGraphThread([], 'uid-1', {});
  assert.equal(t.id, '');
  assert.equal(t.items.length, 0);
});
