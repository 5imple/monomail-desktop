import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  translateQuery,
  planMutation,
  base64UrlToBase64
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

test('base64UrlToBase64: round-trips through atob for the MIME sendMail envelope', () => {
  for (const sample of ['M365', 'Hello, world!', 'a', 'ab', 'abc', '<p>x</p>\r\n']) {
    const url = btoa(sample).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    assert.equal(atob(base64UrlToBase64(url)), sample);
  }
});
