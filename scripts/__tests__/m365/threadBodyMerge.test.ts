import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { withCachedBodies } from '@/main/models/message/bodyData';
import { threadNeedsFullBody } from '@/renderer/app/lib/threadBodyPrefetch';

// A partial (newest-message-first) thread must not blank bodies the cache
// already holds for older messages while the full thread is still loading.

const message = (id: string, body?: string) => ({
  id,
  type: 'message' as const,
  threadId: 't',
  timestamp: 1,
  labelIds: [],
  payload: {
    mimeType: 'text/html',
    headers: [],
    body: body ? { data: body, size: body.length } : { size: 0 }
  }
});

const thread = (items: ReturnType<typeof message>[]) =>
  MonoThread.fromPlainObject({ id: 't', accountId: 'a', items } as never);

test('threadBodyMerge: cached bodies fill in metadata-only partial messages', () => {
  const cached = thread([message('m1', 'b1'), message('m2', 'b2')]);
  const partial = thread([message('m1'), message('m2'), message('m3', 'b3')]);
  const merged = withCachedBodies(partial, cached);
  assert.deepEqual(
    merged.items.map(
      (i) => (i as never as { payload: { body: { data?: string } } }).payload.body.data
    ),
    ['b1', 'b2', 'b3']
  );
  assert.equal(threadNeedsFullBody(merged), false);
});

test('threadBodyMerge: without a cached body the partial is still marked incomplete', () => {
  const merged = withCachedBodies(thread([message('m1'), message('m2', 'b2')]), null);
  assert.equal(threadNeedsFullBody(merged), true);
});

// A conversation holding a fetched, empty message (an Outlook "Accepted:"
// reply: data '') is loaded. It used to read as "not loaded" forever, so
// hover prefetch was wasted and every open fetched the whole thread again.
const emptyMessage = (id: string) => ({
  ...message(id),
  payload: { mimeType: 'text/html', headers: [], body: { data: '', size: 0 } }
});

test('threadBodyMerge: an empty fetched message does not make the thread need a fetch', () => {
  assert.equal(threadNeedsFullBody(thread([message('m1', 'b1'), emptyMessage('m2')])), false);
  // A metadata-only message still does.
  assert.equal(
    threadNeedsFullBody(thread([message('m1', 'b1'), emptyMessage('m2'), message('m3')])),
    true
  );
});

test('threadBodyMerge: a cached empty body carries over to a listing like any other', () => {
  const cached = thread([message('m1', 'b1'), emptyMessage('m2')]);
  const listing = thread([message('m1'), message('m2')]);
  assert.equal(threadNeedsFullBody(withCachedBodies(listing, cached)), false);
});
