import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relabelThread } from '@/renderer/app/store/thread/useThreadOperations';
import { MonoThread } from '@/main/models/thread/MonoThread';
import {
  isAllMine,
  rowAvatarRecipient,
  stripExternalBanner
} from '@/renderer/app/components/mail/thread/threadRowModel';
import { threadHasFileAttachments } from '@/renderer/app/lib/threadAttachments';

const me = { email: 'Me@WashColl.edu' };
const msg = (email: string, extra: Record<string, unknown> = {}) => ({
  type: 'message',
  from: { email, name: email.split('@')[0] },
  ...extra
});
const thread = (items: unknown[], to: { email: string; name?: string }[] = []) =>
  ({ id: 't', items, to, from: [], attachments: {} }) as any;

test('stripExternalBanner drops the org banner, including a truncated one', () => {
  assert.equal(
    stripExternalBanner(
      '**External Email-Use caution with attachments and links from unknown senders ** Hello Rous'
    ),
    'Hello Rous'
  );
  assert.equal(stripExternalBanner('**External Email-Use caution with attachments and li'), '');
  assert.equal(stripExternalBanner('Thanks, see you **Friday**'), 'Thanks, see you **Friday**');
  assert.equal(stripExternalBanner(null), '');
});

test('isAllMine is true only when every message is from one of your accounts', () => {
  assert.equal(isAllMine(thread([msg('me@washcoll.edu')]), [me]), true);
  assert.equal(isAllMine(thread([msg('me@washcoll.edu'), msg('bob@x.com')]), [me]), false);
  assert.equal(isAllMine(thread([{ type: 'draft' }]), [me]), false);
});

test('rowAvatarRecipient shows the person you wrote to on Sent threads', () => {
  const sent = thread(
    [msg('me@washcoll.edu')],
    [{ email: 'me@washcoll.edu' }, { email: 'kait@x.com' }]
  );
  assert.equal(rowAvatarRecipient(sent, [me]).email, 'kait@x.com');
  const convo = thread([msg('bob@x.com'), msg('me@washcoll.edu')], [{ email: 'bob@x.com' }]);
  assert.equal(rowAvatarRecipient(convo, [me]).email, 'me@washcoll.edu');
  const toSelf = thread([msg('me@washcoll.edu')], [{ email: 'me@washcoll.edu' }]);
  assert.equal(rowAvatarRecipient(toSelf, [me]).email, 'me@washcoll.edu');
});

test('threadHasFileAttachments honours Graph hasAttachments on list items', () => {
  assert.equal(threadHasFileAttachments(thread([msg('a@x.com')])), false);
  assert.equal(threadHasFileAttachments(thread([msg('a@x.com', { hasAttachments: true })])), true);
  assert.equal(
    threadHasFileAttachments({ attachments: { 'a.pdf': {} as any }, items: [] } as any),
    true
  );
});

test('stripExternalBanner drops Microsoft first-contact safety tips', () => {
  assert.equal(
    stripExternalBanner(
      "You don't often get email from amerfieldmarketing@mkt.databricks.com. Learn why this is important Join us Tuesday"
    ),
    'Join us Tuesday'
  );
  assert.equal(
    stripExternalBanner(
      "Some people who received this message don't often get email from natalie.tjaden@jpmorgan.com. Learn why this is important Hello all"
    ),
    'Hello all'
  );
  assert.equal(
    stripExternalBanner(
      "**External Email-Use caution with attachments and links from unknown senders ** You don't often get email from a@b.co. Learn why this is important Hi"
    ),
    'Hi'
  );
  assert.equal(stripExternalBanner('You don’t say!'), 'You don’t say!');
});

// Label changes make new thread / item objects (list rows subscribe by identity).

test('relabelThread: new thread and item objects, prototype and hidden accountId kept', () => {
  const thread = new MonoThread({
    id: 't1',
    accountId: 'acc',
    labelIds: ['INBOX', 'UNREAD'],
    items: [
      {
        id: 'm1',
        type: 'message',
        threadId: 't1',
        labelIds: ['INBOX', 'UNREAD'],
        payload: { mimeType: 'text/plain', headers: [], body: { size: 0, data: null } }
      } as never
    ]
  });
  // Search results define accountId as non-enumerable.
  Object.defineProperty(thread, 'accountId', { value: 'acc', enumerable: false, writable: false });
  const next = relabelThread(thread, [], ['UNREAD']);
  assert.notEqual(next, thread);
  assert.ok(next instanceof MonoThread);
  assert.deepEqual(next.labelIds, ['INBOX']);
  assert.deepEqual(thread.labelIds, ['INBOX', 'UNREAD'], 'the original is untouched');
  assert.equal(next.accountId, 'acc');
  assert.notEqual(next.items[0], thread.items[0]);
  assert.deepEqual((next.items[0] as { labelIds: string[] }).labelIds, ['INBOX']);
  assert.equal(typeof next.getLastMessage, 'function');
});

test('MonoThread.toPlainObject keeps a non-enumerable accountId (copies keep their account)', () => {
  const thread = new MonoThread({ id: 't2', accountId: 'acc', labelIds: [] });
  Object.defineProperty(thread, 'accountId', { value: 'acc', enumerable: false });
  const copy = new MonoThread({ ...thread.toPlainObject(), items: [] });
  assert.equal(copy.accountId, 'acc');
});
