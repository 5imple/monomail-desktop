import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformGraphMessage,
  isGraphEventMessage,
  graphDateTimeToIso,
  buildMeeting
} from '@/main/api/mail/graphTransforms';
import { payloadHasBodyData, withStoredBody } from '@/main/models/message/bodyData';
import { toMeetingKind, toMeetingResponse } from '@/main/models/message/meeting';
import { formatMeetingWhen } from '@/renderer/app/lib/meetingText';
import { microsoftMailProvider } from '@/main/api/mail/providers/microsoftMailProvider';
// Resolved (via the runner's alias) to scripts/__tests__/m365/stubs/apiClient.mjs.
import { __setGraphHandler, __setBatchHandler, __getRequests, __reset } from '@/main/api/apiClient';

// Meeting invitations, cancellations and replies arrive from Graph as
// eventMessage items with an empty body; the meeting is in the derived type's
// fields and the event it points at. These cover the mapping, the extra fetch
// that gets those fields, and the "fetched but empty" body distinction that
// keeps such messages from being re-fetched on every open.

beforeEach(() => __reset());

const okFolderMap = () =>
  __setBatchHandler(async () => ({
    ok: true,
    responses: [
      { id: '0', status: 200, body: { id: 'INBOX_ID' } },
      { id: '1', status: 200, body: { id: 'SENT_ID' } },
      { id: '2', status: 404 },
      { id: '3', status: 200, body: { id: 'TRASH_ID' } },
      { id: '4', status: 200, body: { id: 'JUNK_ID' } }
    ]
  }));

const invite = {
  '@odata.type': '#microsoft.graph.eventMessageRequest',
  id: 'm-evt',
  conversationId: 'c-evt',
  subject: 'Invitation: Standup',
  bodyPreview: '',
  body: { contentType: 'html', content: '' },
  from: { emailAddress: { name: 'Olive', address: 'olive@x.com' } },
  toRecipients: [{ emailAddress: { name: 'Me', address: 'me@x.com' } }],
  receivedDateTime: '2026-10-26T09:00:00Z',
  parentFolderId: 'INBOX_ID',
  meetingMessageType: 'meetingRequest',
  startDateTime: { dateTime: '2026-10-28T15:00:00.0000000', timeZone: 'UTC' },
  endDateTime: { dateTime: '2026-10-28T15:30:00.0000000', timeZone: 'UTC' },
  location: { displayName: 'Room 4' },
  isAllDay: false,
  isOutOfDate: false,
  event: {
    id: 'evt-1',
    subject: 'Standup',
    start: { dateTime: '2026-10-28T15:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-10-28T15:30:00.0000000', timeZone: 'UTC' },
    isAllDay: false,
    isCancelled: false,
    location: { displayName: 'Room 4' },
    organizer: { emailAddress: { name: 'Olive', address: 'olive@x.com' } },
    attendees: [
      {
        type: 'required',
        status: { response: 'none' },
        emailAddress: { name: 'Me', address: 'me@x.com' }
      },
      {
        type: 'required',
        status: { response: 'accepted' },
        emailAddress: { name: 'Pat', address: 'pat@x.com' }
      }
    ],
    responseStatus: { response: 'notResponded' },
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc' }
  }
};

test('isGraphEventMessage: only derived eventMessage types, with or without the #', () => {
  assert.equal(isGraphEventMessage({ '@odata.type': '#microsoft.graph.eventMessage' }), true);
  assert.equal(
    isGraphEventMessage({ '@odata.type': '#microsoft.graph.eventMessageResponse' }),
    true
  );
  assert.equal(isGraphEventMessage({ '@odata.type': 'microsoft.graph.eventMessageRequest' }), true);
  assert.equal(isGraphEventMessage({ '@odata.type': '#microsoft.graph.message' }), false);
  assert.equal(isGraphEventMessage({}), false);
});

test('graphDateTimeToIso: UTC values get their Z; offsets and blanks are respected', () => {
  assert.equal(
    graphDateTimeToIso({ dateTime: '2026-10-28T15:00:00.0000000', timeZone: 'UTC' }),
    '2026-10-28T15:00:00.000Z'
  );
  assert.equal(
    graphDateTimeToIso({ dateTime: '2026-10-28T15:00:00+02:00', timeZone: 'Europe/Berlin' }),
    '2026-10-28T13:00:00.000Z'
  );
  assert.equal(graphDateTimeToIso({ dateTime: '', timeZone: 'UTC' }), null);
  assert.equal(graphDateTimeToIso(undefined), null);
  assert.equal(graphDateTimeToIso({ dateTime: 'not a date' }), null);
});

test('meeting enums: Graph vocabulary (including its misspelling) maps to ours', () => {
  assert.equal(toMeetingKind('meetingRequest'), 'request');
  assert.equal(toMeetingKind('meetingCancelled'), 'cancelled');
  assert.equal(toMeetingKind('meetingTenativelyAccepted'), 'tentative');
  assert.equal(toMeetingKind('meetingTentativelyAccepted'), 'tentative');
  assert.equal(toMeetingKind('none'), null);
  assert.equal(toMeetingResponse('tentativelyAccepted'), 'tentative');
  assert.equal(toMeetingResponse('organizer'), 'organizer');
  assert.equal(toMeetingResponse('notResponded'), 'none');
});

test('transformGraphMessage: an invitation carries the meeting; ordinary mail does not', () => {
  const mapped = transformGraphMessage(invite as never, { folderLabel: 'INBOX' });
  assert.ok(mapped.meeting);
  assert.equal(mapped.meeting?.kind, 'request');
  assert.equal(mapped.meeting?.eventId, 'evt-1');
  assert.equal(mapped.meeting?.subject, 'Standup');
  assert.equal(mapped.meeting?.start, '2026-10-28T15:00:00.000Z');
  assert.equal(mapped.meeting?.end, '2026-10-28T15:30:00.000Z');
  assert.equal(mapped.meeting?.location, 'Room 4');
  assert.equal(mapped.meeting?.joinUrl, 'https://teams.microsoft.com/l/meetup-join/abc');
  assert.deepEqual(mapped.meeting?.organizer, { name: 'Olive', email: 'olive@x.com' });
  assert.equal(mapped.meeting?.attendees.length, 2);
  assert.equal(mapped.meeting?.attendees[1].response, 'accepted');
  assert.equal(mapped.meeting?.myResponse, 'none');
  assert.equal(mapped.meeting?.isCancelled, false);

  const plain = transformGraphMessage({ ...invite, '@odata.type': undefined } as never);
  assert.equal(plain.meeting, undefined);
});

test('buildMeeting: a reply without its event still shows, from the message fields', () => {
  const reply = {
    '@odata.type': '#microsoft.graph.eventMessageResponse',
    id: 'm-reply',
    subject: 'Accepted: Standup',
    meetingMessageType: 'meetingAccepted',
    startDateTime: { dateTime: '2026-10-28T15:00:00.0000000', timeZone: 'UTC' },
    endDateTime: { dateTime: '2026-10-28T15:30:00.0000000', timeZone: 'UTC' },
    responseType: 'accepted',
    event: null
  };
  const meeting = buildMeeting(reply as never);
  assert.ok(meeting);
  assert.equal(meeting?.kind, 'accepted');
  assert.equal(meeting?.eventId, null);
  assert.equal(meeting?.subject, 'Standup');
  assert.equal(meeting?.start, '2026-10-28T15:00:00.000Z');
  assert.equal(meeting?.attendees.length, 0);

  // An eventMessage whose fields were never fetched is ordinary mail.
  assert.equal(
    buildMeeting({ '@odata.type': '#microsoft.graph.eventMessage', id: 'x' } as never),
    null
  );
});

test('buildMeeting: a cancellation is cancelled even if the event still reads otherwise', () => {
  const meeting = buildMeeting({
    ...invite,
    '@odata.type': '#microsoft.graph.eventMessage',
    meetingMessageType: 'meetingCancelled'
  } as never);
  assert.equal(meeting?.kind, 'cancelled');
  assert.equal(meeting?.isCancelled, true);
});

test('synthetic payload: no body fetched → data null; fetched but empty → data "" (stays fetched)', () => {
  const listed = transformGraphMessage({ id: 'l', body: undefined } as never);
  assert.equal(listed.payload.parts?.[0].body.data, null);
  assert.equal(payloadHasBodyData(listed.payload), false);
  // A listing has no body text either way (an empty bodyPlain read as a
  // fetched, empty text body).
  assert.equal(listed.bodyHtml, undefined);
  assert.equal(listed.bodyPlain, undefined);

  // An empty body (every Outlook Accepted / Declined reply) is fetched: the
  // conversation holding it is loaded, so opening it doesn't fetch again.
  // Older caches' metadata-only copies with data '' are reset by the v5
  // IndexedDB migration (bodyData.withLegacyEmptyBodyCleared).
  const empty = transformGraphMessage({
    id: 'e',
    body: { contentType: 'html', content: '' }
  } as never);
  assert.equal(empty.payload.parts?.[0].body.data, '');
  assert.equal(payloadHasBodyData(empty.payload), true);
  assert.equal(empty.bodyHtml, '');

  const full = transformGraphMessage({
    id: 'f',
    body: { contentType: 'html', content: '<p>hi</p>' }
  } as never);
  assert.equal(payloadHasBodyData(full.payload), true);
});

test('withStoredBody: the stored meeting rides along with the stored body', () => {
  const stored = transformGraphMessage({
    ...invite,
    body: { contentType: 'html', content: '<p>Agenda</p>' }
  } as never) as never as Parameters<typeof withStoredBody>[1];
  const listed = transformGraphMessage({
    ...invite,
    body: undefined,
    event: undefined,
    meetingMessageType: undefined
  } as never);
  assert.equal(listed.meeting, undefined);
  const merged = withStoredBody(listed as never, stored);
  assert.equal((merged as { meeting?: { eventId: string | null } }).meeting?.eventId, 'evt-1');
  assert.equal(payloadHasBodyData((merged as { payload: never }).payload), true);
});

test('formatMeetingWhen: one line for a same-day span, all-day spans name the last day', () => {
  const start = new Date(2026, 9, 28, 15, 0).toISOString();
  const end = new Date(2026, 9, 28, 15, 30).toISOString();
  const same = formatMeetingWhen(start, end, false, 'All day', 'en-US', new Date(2026, 0, 1));
  assert.ok(same);
  assert.match(same!.date, /Wednesday, October 28/);
  assert.match(same!.time, /3:00.*–.*3:30/);

  const allDay = formatMeetingWhen(
    new Date(2026, 9, 28).toISOString(),
    new Date(2026, 9, 30).toISOString(), // exclusive: ends at midnight after the 29th
    true,
    'All day',
    'en-US',
    new Date(2026, 0, 1)
  );
  assert.equal(allDay?.time, 'All day');
  assert.match(allDay!.date, /October 28 – .*Oct 29/);

  const lastYear = formatMeetingWhen(start, end, false, 'All day', 'en-US', new Date(2027, 0, 1));
  assert.match(lastYear!.date, /2026/);
  assert.equal(formatMeetingWhen(null, null, false, 'All day'), null);
});

const detailRoute = /\/me\/messages\/m-evt\?%24select=/;
const expandWithSelect =
  /\/me\/messages\/m-evt\?%24expand=microsoft\.graph\.eventMessage%2Fevent%28/;
const expandPlain = /\/me\/messages\/m-evt\?%24expand=microsoft\.graph\.eventMessage%2Fevent$/;
const bareMessage = /\/me\/messages\/m-evt$/;

const listedInvite = {
  ...invite,
  event: undefined,
  meetingMessageType: undefined,
  startDateTime: undefined
};

test('getMessage: a meeting message gets one more GET, event expanded, and comes back with its meeting', async () => {
  okFolderMap();
  __setGraphHandler(async (_m: string, url: string) => {
    if (detailRoute.test(url)) return listedInvite;
    if (expandWithSelect.test(url)) return invite;
    throw { status: 404 };
  });
  const message = await microsoftMailProvider.getMessage('uid-meeting-1', 'm-evt');
  assert.equal(message.meeting?.kind, 'request');
  assert.equal(message.meeting?.eventId, 'evt-1');
  const gets = __getRequests().filter((r: { method: string }) => r.method === 'GET');
  assert.equal(gets.filter((r: { url: string }) => expandWithSelect.test(r.url)).length, 1);
});

test('getMessage: when the cast expand with $select is refused, the documented plain expand is used', async () => {
  okFolderMap();
  __setGraphHandler(async (_m: string, url: string) => {
    if (detailRoute.test(url)) return listedInvite;
    if (expandWithSelect.test(url)) throw { status: 400, data: { error: { code: 'BadRequest' } } };
    if (expandPlain.test(url)) return invite;
    throw { status: 404 };
  });
  const message = await microsoftMailProvider.getMessage('uid-meeting-2', 'm-evt');
  assert.equal(message.meeting?.eventId, 'evt-1');
});

test('getMessage: with no event reachable the meeting still shows, without an id to RSVP with', async () => {
  okFolderMap();
  __setGraphHandler(async (_m: string, url: string) => {
    if (detailRoute.test(url)) return listedInvite;
    if (expandWithSelect.test(url) || expandPlain.test(url)) throw { status: 404 };
    if (bareMessage.test(url)) return { ...invite, event: undefined };
    throw { status: 404 };
  });
  const message = await microsoftMailProvider.getMessage('uid-meeting-3', 'm-evt');
  assert.equal(message.meeting?.kind, 'request');
  assert.equal(message.meeting?.eventId, null);
  assert.equal(message.meeting?.start, '2026-10-28T15:00:00.000Z');
});

test('getMessage: ordinary mail costs no extra request', async () => {
  okFolderMap();
  __setGraphHandler(async (_m: string, url: string) => {
    if (detailRoute.test(url)) return { ...listedInvite, '@odata.type': undefined };
    throw { status: 404 };
  });
  const message = await microsoftMailProvider.getMessage('uid-meeting-4', 'm-evt');
  assert.equal(message.meeting, undefined);
  const gets = __getRequests().filter((r: { method: string }) => r.method === 'GET');
  assert.equal(gets.length, 1);
});
