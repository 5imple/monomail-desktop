import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  translateQuery,
  planMutation,
  selectMessagesToMove,
  base64UrlToBase64,
  classifyGraphDeltaError
} from '@/main/api/mail/graphRequestMapping';

test('translateQuery: folder tokens map to Graph well-known folders', () => {
  assert.equal(translateQuery('label:INBOX').folder, 'inbox');
  assert.equal(translateQuery('label:SENT').folder, 'sentitems');
  assert.equal(translateQuery('in:trash').folder, 'deleteditems');
  assert.equal(translateQuery('label:SPAM').folder, 'junkemail');
  assert.equal(translateQuery('label:JUNK').folder, 'junkemail');
});

test('translateQuery: read/flag filters', () => {
  assert.equal(translateQuery('label:INBOX is:unread').filter, 'isRead eq false');
  assert.match(String(translateQuery('is:starred').filter), /flag\/flagStatus eq 'flagged'/);
  assert.equal(
    translateQuery('label:INBOX is:unread is:starred').filter,
    "isRead eq false and flag/flagStatus eq 'flagged'"
  );
});

test('translateQuery: empty query is a translated Inbox view', () => {
  const r = translateQuery('');
  assert.equal(r.folder, 'inbox');
  assert.equal(r.translated, true);
});

test('translateQuery: untranslatable query is flagged + falls back to Inbox', () => {
  const r = translateQuery('from:bob@x.com subject:hi');
  assert.equal(r.folder, 'inbox');
  assert.equal(r.translated, false);
});

test('planMutation: read/unread → PATCH isRead', () => {
  assert.deepEqual(planMutation([], ['UNREAD']).patch, { isRead: true });
  assert.deepEqual(planMutation(['UNREAD'], []).patch, { isRead: false });
});

test('planMutation: star/unstar → PATCH flag.flagStatus', () => {
  assert.deepEqual(planMutation(['STARRED'], []).patch, { flag: { flagStatus: 'flagged' } });
  assert.deepEqual(planMutation([], ['STARRED']).patch, { flag: { flagStatus: 'notFlagged' } });
});

test('planMutation: archive (remove INBOX) → move to the archive well-known name', () => {
  const p = planMutation([], ['INBOX']);
  assert.equal(p.moveTo, 'archive');
  assert.equal(p.patch, undefined);
});

test('planMutation: trash / junk / restore / custom-folder moves', () => {
  assert.equal(planMutation(['TRASH'], []).moveTo, 'deleteditems');
  assert.equal(planMutation(['SPAM'], []).moveTo, 'junkemail');
  assert.equal(planMutation(['INBOX'], []).moveTo, 'inbox');
  assert.equal(planMutation([], ['TRASH']).moveTo, 'inbox');
  assert.equal(planMutation([], ['SPAM']).moveTo, 'inbox'); // restore from junk
  assert.equal(planMutation(['folder:AAMk123'], []).moveTo, 'AAMk123');
});

test('planMutation: mark-read while archiving yields BOTH patch and move', () => {
  const p = planMutation([], ['UNREAD', 'INBOX']);
  assert.deepEqual(p.patch, { isRead: true });
  assert.equal(p.moveTo, 'archive');
});

test('planMutation: unrecognized labels are a no-op (no patch, no move)', () => {
  const p = planMutation(['CATEGORY_PROMOTIONS'], []);
  assert.equal(p.patch, undefined);
  assert.equal(p.moveTo, undefined);
});

// One conversation spread over every kind of folder (selectMessagesToMove).
const FOLDERS = {
  inbox: 'INBOX_ID',
  archive: 'ARCHIVE_ID',
  sentitems: 'SENT_ID',
  drafts: 'DRAFTS_ID',
  outbox: 'OUTBOX_ID',
  deleteditems: 'TRASH_ID',
  junkemail: 'JUNK_ID'
};
const CONVERSATION = [
  { id: 'in1', parentFolderId: 'INBOX_ID' },
  { id: 'in2', parentFolderId: 'INBOX_ID' },
  { id: 'arc', parentFolderId: 'ARCHIVE_ID' },
  { id: 'sent', parentFolderId: 'SENT_ID' },
  { id: 'draft', parentFolderId: 'DRAFTS_ID' },
  { id: 'out', parentFolderId: 'OUTBOX_ID' },
  { id: 'trash', parentFolderId: 'TRASH_ID' },
  { id: 'junk', parentFolderId: 'JUNK_ID' },
  { id: 'filed', parentFolderId: 'PROJECTS_ID' }
];
const select = (add: string[], remove: string[]) =>
  selectMessagesToMove(CONVERSATION, planMutation(add, remove).moveTo!, add, remove, FOLDERS);

test('selectMessagesToMove: Done takes only the Inbox copies (archived ones and sent replies stay)', () => {
  // Re-moving the already-archived copy is what Exchange refused (500), failing Done.
  assert.deepEqual(select([], ['INBOX']), ['in1', 'in2']);
});

test('selectMessagesToMove: back to the Inbox takes the archived and filed copies only', () => {
  assert.deepEqual(select(['INBOX'], []), ['arc', 'filed']);
});

test('selectMessagesToMove: out of Trash / Junk takes the copies in there only', () => {
  assert.deepEqual(select([], ['TRASH']), ['trash']);
  assert.deepEqual(select([], ['SPAM']), ['junk']);
  // Moved to the Inbox from Trash: the trashed copies plus the archived / filed ones.
  assert.deepEqual(select(['INBOX'], ['TRASH']), ['arc', 'trash', 'filed']);
});

test('selectMessagesToMove: to Trash, Junk or a folder skips the copies already there', () => {
  const all = CONVERSATION.map((m) => m.id);
  assert.deepEqual(
    select(['TRASH'], []),
    all.filter((id) => id !== 'trash')
  );
  assert.deepEqual(
    select(['SPAM'], []),
    all.filter((id) => id !== 'junk')
  );
  assert.deepEqual(
    select(['folder:PROJECTS_ID'], []),
    all.filter((id) => id !== 'filed')
  );
});

test('selectMessagesToMove: nothing left to move is an empty list (Done twice)', () => {
  const archived = [{ id: 'arc', parentFolderId: 'ARCHIVE_ID' }];
  assert.deepEqual(selectMessagesToMove(archived, 'archive', [], ['INBOX'], FOLDERS), []);
});

test('classifyGraphDeltaError: maps cursor failures to recovery actions', () => {
  // The crux fix: the COMMON cursor-expiry is syncStateNotFound (a 4xx, not 410).
  assert.equal(classifyGraphDeltaError(410), 'reset');
  assert.equal(classifyGraphDeltaError(400, 'syncStateNotFound'), 'reset');
  assert.equal(classifyGraphDeltaError(400, 'SyncStateNotFound'), 'reset'); // case-insensitive
  assert.equal(classifyGraphDeltaError(400, 'resyncRequired'), 'reset');
  assert.equal(classifyGraphDeltaError(429), 'retry');
  assert.equal(classifyGraphDeltaError(401), 'expired');
  assert.equal(classifyGraphDeltaError(403), 'expired');
  assert.equal(classifyGraphDeltaError(503), 'error'); // transient — keep cursor
  assert.equal(classifyGraphDeltaError(undefined, undefined), 'error');
  assert.equal(classifyGraphDeltaError(400, 'someOtherCode'), 'error'); // generic 4xx keeps cursor
});

test('base64UrlToBase64: round-trips through atob for the MIME sendMail envelope', () => {
  const samples = ['M365', 'Hello, world!', 'a', 'ab', 'abc', '<p>x</p>\r\n'];
  // Include byte sequences whose standard base64 contains BOTH '+' and '/', so
  // the '-'→'+' AND '_'→'/' replacement branches are both exercised (regression
  // guard: deleting either replace() would otherwise still pass).
  samples.push(String.fromCharCode(0, 0, 255)); // → 'AAD/' → url 'AAD_'
  samples.push(String.fromCharCode(255, 224, 255)); // → '/+D/'-ish, exercises '+'
  for (const sample of samples) {
    const url = btoa(sample).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    assert.equal(atob(base64UrlToBase64(url)), sample);
  }
  // Explicit: the underscore branch.
  assert.equal(base64UrlToBase64('AAD_'), 'AAD/');
  assert.equal(base64UrlToBase64('a-b_c'), 'a+b/c===');
});
