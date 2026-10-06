import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import thread from '@/main/api/mail/thread';
// Resolved (via the runner's alias) to scripts/__tests__/m365/stubs/apiClient.mjs;
// gmailApiClient shares the recorded Graph handler there.
import { __setGraphHandler, __getRequests, __reset } from '@/main/api/apiClient';

// Gmail side of the progressive thread load: metadata for every message plus
// the newest message in full first, then the format=full thread.

beforeEach(() => __reset());

const raw = (id: string, internalDate: string, withBody: boolean) => ({
  id,
  threadId: 't1',
  labelIds: ['INBOX'],
  internalDate,
  payload: {
    mimeType: 'text/html',
    headers: [
      { name: 'Subject', value: 'Hello' },
      { name: 'From', value: 'a@x.com' },
      { name: 'Date', value: new Date(Number(internalDate)).toUTCString() }
    ],
    body: withBody ? { data: Buffer.from(`<p>${id}</p>`).toString('base64url'), size: 10 } : { size: 0 }
  }
});

type Part = { body?: { data?: string }; parts?: Part[] };
const partHasData = (part?: Part): boolean => !!part?.body?.data || (part?.parts ?? []).some(partHasData);
const withBodies = (t: { items: Array<{ id: string; payload?: Part }> }) =>
  t.items.filter((item) => partHasData(item.payload)).map((item) => item.id);

test('gmail getThread: progressive load sends the newest body first, then format=full', async () => {
  __setGraphHandler(async (_method: string, url: string) => {
    if (/format=metadata/.test(url))
      return { id: 't1', messages: [raw('m1', '1000', false), raw('m3', '3000', false), raw('m2', '2000', false)] };
    if (/\/messages\/m3\?format=full/.test(url)) return raw('m3', '3000', true);
    if (/\/threads\/t1\?format=full/.test(url)) {
      // The full, body-laden response is the slow one in real life.
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { id: 't1', messages: [raw('m1', '1000', true), raw('m2', '2000', true), raw('m3', '3000', true)] };
    }
    throw { status: 404 };
  });

  const partials: Array<{ items: Array<{ id: string; payload?: Part }> }> = [];
  const full = await thread.getThread('uid-g', 't1', undefined, (p) => {
    partials.push(p as never);
  });

  assert.equal(partials.length, 1);
  assert.deepEqual(withBodies(partials[0]), ['m3']); // newest by internalDate, not array order
  assert.deepEqual(withBodies(full as never).sort(), ['m1', 'm2', 'm3']);
  // Only the newest message's body is fetched separately.
  const urls = __getRequests().map((r) => r.url);
  assert.deepEqual(urls.filter((u) => /\/messages\//.test(u)), ['/messages/m3?format=full']);
});

test('gmail getThread: without onPartial it is a single format=full request', async () => {
  __setGraphHandler(async () => ({ id: 't1', messages: [raw('m1', '1000', true)] }));
  await thread.getThread('uid-g2', 't1');
  assert.equal(__getRequests().length, 1);
  assert.match(__getRequests()[0].url, /format=full/);
});
