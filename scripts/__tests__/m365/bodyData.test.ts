import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  messageContent,
  payloadHasBodyData,
  withCachedBodies,
  withLegacyEmptyBodyCleared,
  withStoredBody
} from '@/main/models/message/bodyData';
import { IMonoMessage, MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';

// A message as a listing carries it: headers and labels, no body.
const metadataOnly = (id: string, labelIds: string[] = ['INBOX', 'UNREAD']): IMonoMessage => ({
  id,
  timestamp: 1,
  author: { name: 'Ann', email: 'ann@example.com' },
  type: 'message',
  timezone: '',
  threadId: 't1',
  subject: 'Hello',
  labelIds,
  snippet: 'Hello there',
  historyId: '10',
  cc: [],
  bcc: [],
  to: [],
  from: { name: 'Ann', email: 'ann@example.com' },
  listUnsubscribe: { url: [], mailTo: [] },
  inlineImageSize: 0,
  inlineImages: {},
  attachments: {},
  payload: {
    partId: '',
    mimeType: 'text/html',
    fileName: '',
    body: { attachmentId: null, size: 0, data: null }
  }
});

// The same message after a full fetch.
const withBody = (id: string, labelIds?: string[]): IMonoMessage => ({
  ...metadataOnly(id, labelIds),
  inlineImageSize: 3,
  bodyHtml: '<p>Hello there</p>',
  payload: {
    partId: '',
    mimeType: 'multipart/alternative',
    fileName: '',
    body: { attachmentId: null, size: 0, data: null },
    parts: [
      {
        partId: '0',
        mimeType: 'text/html',
        fileName: '',
        body: { attachmentId: null, size: 18, data: 'PHA+SGVsbG8gdGhlcmU8L3A+' }
      }
    ]
  }
});

const thread = (messages: IMonoMessage[]) =>
  new MonoThread({ id: 't1', accountId: 'acc', labelIds: ['INBOX'], items: messages });

const bodyOf = (t: MonoThread, id: string) =>
  payloadHasBodyData((t.items.find((item) => item.id === id) as MonoMessage).payload);

test('payloadHasBodyData: a body anywhere in the part tree counts, an empty tree does not', () => {
  assert.equal(payloadHasBodyData(metadataOnly('m').payload), false);
  assert.equal(payloadHasBodyData(withBody('m').payload), true);
  assert.equal(payloadHasBodyData(undefined), false);
});

// A fetched body that is empty (an Outlook "Accepted:" reply) has data ''.
const fetchedEmpty = (id: string): IMonoMessage => {
  const full = withBody(id);
  return {
    ...full,
    bodyHtml: '',
    payload: {
      ...full.payload,
      parts: [{ ...full.payload.parts![0], body: { attachmentId: null, size: 0, data: '' } }]
    }
  };
};

test('payloadHasBodyData: an empty fetched body (data "") counts as fetched, null does not', () => {
  assert.equal(payloadHasBodyData(fetchedEmpty('m').payload), true);
  // A part with no data field at all (Gmail multipart containers) is not a body.
  assert.equal(
    payloadHasBodyData({
      partId: '',
      mimeType: 'text/html',
      fileName: '',
      body: { size: 0 }
    } as never),
    false
  );
});

test('withStoredBody: an empty fetched body is kept, not replaced by a stored one', () => {
  const empty = fetchedEmpty('m');
  assert.equal(withStoredBody(empty, withBody('m')), empty);
  // …and a listing keeps the stored empty body (it was fetched).
  const merged = withStoredBody(metadataOnly('m'), empty);
  assert.equal(payloadHasBodyData(merged.payload), true);
});

test('withLegacyEmptyBodyCleared: a stored copy with only "" data reads as not fetched again', () => {
  const legacy = fetchedEmpty('m');
  const cleared = withLegacyEmptyBodyCleared(legacy);
  assert.ok(cleared);
  assert.equal(payloadHasBodyData(cleared!.payload), false);
  assert.equal(cleared!.payload.parts![0].body.data, null);
  // Everything else stays.
  assert.equal(cleared!.id, 'm');
  assert.deepEqual(cleared!.labelIds, legacy.labelIds);
  // The input is not mutated.
  assert.equal(legacy.payload.parts![0].body.data, '');
});

test('withLegacyEmptyBodyCleared: real bodies and unfetched copies are left alone', () => {
  assert.equal(withLegacyEmptyBodyCleared(withBody('m')), null);
  assert.equal(withLegacyEmptyBodyCleared(metadataOnly('m')), null);
  // One part with text is a real body even if another part is empty.
  const mixed = withBody('m');
  mixed.payload.parts!.push({
    partId: '1',
    mimeType: 'text/plain',
    fileName: '',
    body: { attachmentId: null, size: 0, data: '' }
  });
  assert.equal(withLegacyEmptyBodyCleared(mixed), null);
});

test('messageContent: snippet, files and meeting invitations count; empty replies do not', () => {
  assert.equal(messageContent(withBody('m')), 'content');
  assert.equal(messageContent({ ...metadataOnly('m'), snippet: '' }), 'unknown');
  assert.equal(messageContent({ ...fetchedEmpty('m'), snippet: '' }), 'empty');
  assert.equal(messageContent({ ...withBody('m'), snippet: '' }), 'content');
  assert.equal(
    messageContent({
      ...fetchedEmpty('m'),
      snippet: '',
      attachments: {
        'a.pdf': { attachmentId: 'a', fileName: 'a.pdf', mimeType: 'application/pdf', size: 1 }
      }
    }),
    'content'
  );
  const meeting = (kind: string) =>
    ({ ...fetchedEmpty('m'), snippet: '', meeting: { kind } }) as unknown as IMonoMessage;
  assert.equal(messageContent(meeting('accepted')), 'empty');
  assert.equal(messageContent(meeting('declined')), 'empty');
  assert.equal(messageContent(meeting('request')), 'content');
  assert.equal(messageContent(meeting('cancelled')), 'content');
  // A reply with words in it is content.
  assert.equal(messageContent({ ...meeting('accepted'), snippet: 'See you there' }), 'content');
});

test('withStoredBody: a listing keeps the stored body and its own labels', () => {
  const merged = withStoredBody(metadataOnly('m', ['INBOX']), withBody('m', ['INBOX', 'UNREAD']));
  assert.equal(payloadHasBodyData(merged.payload), true);
  assert.equal(merged.bodyHtml, '<p>Hello there</p>');
  assert.equal(merged.inlineImageSize, 3);
  assert.deepEqual(merged.labelIds, ['INBOX']);
});

test('withStoredBody: nothing to carry returns the incoming copy itself', () => {
  const full = withBody('m');
  assert.equal(withStoredBody(full, metadataOnly('m')), full);
  const meta = metadataOnly('m');
  assert.equal(withStoredBody(meta, metadataOnly('m')), meta);
  assert.equal(withStoredBody(meta, undefined), meta);
});

test('withCachedBodies: a refreshed listing keeps the bodies the cached thread had', () => {
  const cached = thread([withBody('m1'), metadataOnly('m2')]);
  const listing = thread([metadataOnly('m1', ['INBOX']), metadataOnly('m2'), metadataOnly('m3')]);

  const merged = withCachedBodies(listing, cached);

  assert.notEqual(merged, listing);
  assert.equal(bodyOf(merged, 'm1'), true);
  assert.equal(bodyOf(merged, 'm2'), false);
  assert.equal(bodyOf(merged, 'm3'), false);
  // The listing's labels win: the email was read since the cache was written.
  assert.deepEqual(merged.items.find((item) => item.id === 'm1')!.labelIds, ['INBOX']);
  assert.equal(merged.items.length, 3);
});

test('withCachedBodies: the same thread comes back when there is nothing to carry', () => {
  const full = thread([withBody('m1')]);
  assert.equal(withCachedBodies(full, thread([withBody('m1')])), full);
  const listing = thread([metadataOnly('m1')]);
  assert.equal(withCachedBodies(listing, thread([metadataOnly('m1')])), listing);
  assert.equal(withCachedBodies(listing, null), listing);
  assert.equal(withCachedBodies(listing, listing), listing);
});
