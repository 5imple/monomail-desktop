import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGmailMailMutation, isGraphMailMutation } from '@/main/services/push/mailMutation';

// Which requests make the inbox refresh itself.

test('Graph: send, reply, forward, move, delete count', () => {
  assert.equal(isGraphMailMutation('POST', '/me/sendMail'), true);
  assert.equal(isGraphMailMutation('POST', '/me/messages/AAk=/send'), true);
  assert.equal(isGraphMailMutation('post', '/me/messages/AAk=/reply'), true);
  assert.equal(isGraphMailMutation('POST', '/me/messages/AAk=/replyAll'), true);
  assert.equal(isGraphMailMutation('POST', '/me/messages/AAk=/forward'), true);
  assert.equal(isGraphMailMutation('POST', '/me/messages/AAk=/move'), true);
  assert.equal(
    isGraphMailMutation('POST', 'https://graph.microsoft.com/v1.0/me/messages/AAk=/move?x=1'),
    true
  );
  assert.equal(isGraphMailMutation('DELETE', '/me/messages/AAk='), true);
});

test('Graph: reads, read/flag changes, drafts and calendar do not', () => {
  assert.equal(isGraphMailMutation('GET', '/me/messages'), false);
  assert.equal(isGraphMailMutation('PATCH', '/me/messages/AAk='), false);
  assert.equal(isGraphMailMutation('POST', '/me/messages'), false);
  assert.equal(isGraphMailMutation('POST', '/me/messages/AAk=/createReply'), false);
  assert.equal(isGraphMailMutation('POST', '/me/events/E1/decline'), false);
  assert.equal(isGraphMailMutation('DELETE', '/me/events/E1'), false);
});

test('Gmail: send, trash, archive and moves count; read and star do not', () => {
  const base = '/gmail/v1/users/me';
  assert.equal(isGmailMailMutation('POST', `${base}/messages/send`), true);
  assert.equal(isGmailMailMutation('POST', `${base}/drafts/send`), true);
  assert.equal(isGmailMailMutation('POST', `${base}/threads/t1/trash`), true);
  assert.equal(isGmailMailMutation('DELETE', `${base}/threads/t1`), true);
  const archive = JSON.stringify({ removeLabelIds: ['INBOX'] });
  assert.equal(isGmailMailMutation('POST', `${base}/threads/t1/modify`, archive), true);
  const read = JSON.stringify({ removeLabelIds: ['UNREAD'] });
  assert.equal(isGmailMailMutation('POST', `${base}/threads/t1/modify`, read), false);
  const star = JSON.stringify({ addLabelIds: ['STARRED'] });
  assert.equal(isGmailMailMutation('POST', `${base}/messages/batchModify`, star), false);
  assert.equal(isGmailMailMutation('POST', `${base}/drafts`), false);
  assert.equal(isGmailMailMutation('GET', `${base}/threads/t1`), false);
});
