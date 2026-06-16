import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GraphEvent,
  RSVP_TO_GRAPH_ACTION,
  buildGraphCreateBody,
  buildGraphUpdateBody,
  mapGraphResponseToGoogle,
  toParsableDateTime,
  transformGraphEvent
} from '@/main/api/calendar/graphCalendarTransforms';

// ── toParsableDateTime ─────────────────────────────────────────────────────────

test('toParsableDateTime: appends Z to a zone-less Graph datetime (UTC default)', () => {
  assert.equal(toParsableDateTime({ dateTime: '2026-06-16T09:00:00.0000000' }), '2026-06-16T09:00:00.0000000Z');
});

test('toParsableDateTime: preserves an existing offset/Z and handles missing', () => {
  assert.equal(toParsableDateTime({ dateTime: '2026-06-16T09:00:00Z' }), '2026-06-16T09:00:00Z');
  assert.equal(toParsableDateTime({ dateTime: '2026-06-16T09:00:00-04:00' }), '2026-06-16T09:00:00-04:00');
  assert.equal(toParsableDateTime(undefined), null);
});

// ── mapGraphResponseToGoogle ───────────────────────────────────────────────────

test('mapGraphResponseToGoogle: Graph statuses → Google vocabulary', () => {
  assert.equal(mapGraphResponseToGoogle('tentativelyAccepted'), 'tentative');
  assert.equal(mapGraphResponseToGoogle('accepted'), 'accepted');
  assert.equal(mapGraphResponseToGoogle('declined'), 'declined');
  assert.equal(mapGraphResponseToGoogle('organizer'), 'accepted');
  assert.equal(mapGraphResponseToGoogle('none'), 'needsAction');
  assert.equal(mapGraphResponseToGoogle('notResponded'), 'needsAction');
  assert.equal(mapGraphResponseToGoogle(undefined), 'needsAction');
});

// ── transformGraphEvent ────────────────────────────────────────────────────────

function timedEvent(over: Partial<GraphEvent> = {}): GraphEvent {
  return {
    id: 'evt1',
    subject: 'Sprint review',
    start: { dateTime: '2026-06-16T14:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-06-16T15:00:00.0000000', timeZone: 'UTC' },
    organizer: { emailAddress: { name: 'Dana', address: 'dana@x.com' } },
    attendees: [
      { emailAddress: { name: 'Dana', address: 'dana@x.com' }, status: { response: 'organizer' } },
      { emailAddress: { name: 'You', address: 'you@x.com' }, status: { response: 'tentativelyAccepted' } }
    ],
    webLink: 'https://outlook.office365.com/...',
    onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/...' },
    ...over
  };
}

test('transformGraphEvent: timed event maps subject/time/attendees/organizer/meeting', () => {
  const e = transformGraphEvent(timedEvent());
  assert.equal(e.summary, 'Sprint review');
  assert.equal(e.start.dateTime, '2026-06-16T14:00:00.0000000Z');
  assert.equal(e.start.date, null);
  assert.equal(e.end.dateTime, '2026-06-16T15:00:00.0000000Z');
  assert.equal(e.organizer.email, 'dana@x.com');
  assert.equal(e.hangoutLink, 'https://teams.microsoft.com/l/meetup-join/...');
  assert.equal(e.status, 'confirmed');
  assert.deepEqual(
    e.attendees.map((a) => [a.email, a.responseStatus, a.organizer]),
    [
      ['dana@x.com', 'accepted', true],
      ['you@x.com', 'tentative', false]
    ]
  );
});

test('transformGraphEvent: all-day event uses date, not dateTime', () => {
  const e = transformGraphEvent(
    timedEvent({
      isAllDay: true,
      start: { dateTime: '2026-06-16T00:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-06-17T00:00:00.0000000', timeZone: 'UTC' }
    })
  );
  assert.equal(e.start.dateTime, null);
  assert.equal(e.start.date, '2026-06-16');
  assert.equal(e.end.date, '2026-06-17');
});

test('transformGraphEvent: cancelled event → status cancelled; missing subject → placeholder', () => {
  const e = transformGraphEvent(timedEvent({ isCancelled: true, subject: undefined }));
  assert.equal(e.status, 'cancelled');
  assert.equal(e.summary, '(No subject)');
});

// ── request bodies ─────────────────────────────────────────────────────────────

test('buildGraphCreateBody: maps summary/time/attendees; all-day uses isAllDay+date', () => {
  const start = Date.UTC(2026, 5, 16, 14, 0, 0);
  const end = Date.UTC(2026, 5, 16, 15, 0, 0);
  const body = buildGraphCreateBody({
    summary: 'Plan',
    startTime: start,
    endTime: end,
    timeZone: 'UTC',
    description: 'agenda',
    location: 'Room 1',
    attendees: ['a@x.com', 'b@x.com']
  });
  assert.equal(body.subject, 'Plan');
  assert.equal(body.isAllDay, false);
  assert.deepEqual(body.body, { contentType: 'HTML', content: 'agenda' });
  assert.deepEqual(body.location, { displayName: 'Room 1' });
  assert.equal((body.attendees as unknown[]).length, 2);
  assert.deepEqual((body.attendees as Array<{ emailAddress: { address: string } }>)[0].emailAddress, {
    address: 'a@x.com'
  });

  const allDay = buildGraphCreateBody({
    summary: 'Holiday',
    startTime: start,
    endTime: end,
    timeZone: 'UTC',
    allDay: true
  });
  assert.equal(allDay.isAllDay, true);
  assert.equal((allDay.start as { dateTime: string }).dateTime.endsWith('T00:00:00'), true);
});

test('buildGraphUpdateBody: only includes provided fields', () => {
  const body = buildGraphUpdateBody({ eventId: 'e1', summary: 'New title' });
  assert.deepEqual(Object.keys(body), ['subject']);
  assert.equal(body.subject, 'New title');
});

test('RSVP_TO_GRAPH_ACTION: maps Google verbs to Graph response actions', () => {
  assert.equal(RSVP_TO_GRAPH_ACTION.accepted, 'accept');
  assert.equal(RSVP_TO_GRAPH_ACTION.declined, 'decline');
  assert.equal(RSVP_TO_GRAPH_ACTION.tentative, 'tentativelyAccept');
});
