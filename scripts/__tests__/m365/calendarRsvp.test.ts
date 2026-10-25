import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { microsoftCalendarProvider } from '@/main/api/calendar/microsoftCalendarProvider';
// Resolved (via the runner's alias) to scripts/__tests__/m365/stubs/apiClient.mjs.
import { __setGraphHandler, __getRequests, __reset } from '@/main/api/apiClient';

beforeEach(() => __reset());

const request = {
  calendarId: 'primary',
  eventId: 'EV1',
  responseStatus: 'declined',
  sendNotifications: true,
  uid: 'microsoft:t:u'
};

test('a decline that went through is not reported as failed when the meeting left the calendar', async () => {
  // Outlook moves a declined meeting to Deleted Items: reading it back 404s.
  __setGraphHandler(async (method: string) => {
    if (method === 'POST') return {};
    throw Object.assign(new Error('The specified object was not found in the store.'), {
      status: 404
    });
  });
  const result = await microsoftCalendarProvider.sendRsvp(request);
  assert.equal(result, null);
  const post = __getRequests().find((r: { method: string }) => r.method === 'POST');
  assert.match(post.url, /\/events\/EV1\/decline$/);
  assert.deepEqual(post.body, { sendResponse: true });
});

test('a refused response still fails', async () => {
  __setGraphHandler(async () => {
    throw Object.assign(new Error('does not support binding to a non-calendar folder'), {
      status: 400
    });
  });
  await assert.rejects(microsoftCalendarProvider.sendRsvp(request));
});
