import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerFromThread,
  isMeetingGoneError,
  planRsvpClick,
  rememberAnswer,
  shownResponse
} from '@/renderer/app/lib/meetingRsvp';

const idle = { shown: 'none', confirmed: 'none', declineHeld: false, sending: false } as const;

test('accept and tentative go out at once; picking the current answer does nothing', () => {
  assert.equal(planRsvpClick('accepted', idle).kind, 'send');
  assert.equal(
    planRsvpClick('tentative', { ...idle, shown: 'accepted', confirmed: 'accepted' }).kind,
    'send'
  );
  assert.equal(
    planRsvpClick('accepted', { ...idle, shown: 'accepted', confirmed: 'accepted' }).kind,
    'ignore'
  );
});

test('a decline is held, and another answer meanwhile replaces it', () => {
  const accepted = { ...idle, shown: 'accepted', confirmed: 'accepted' } as const;
  assert.equal(planRsvpClick('declined', accepted).kind, 'hold-decline');
  const held = { ...accepted, shown: 'declined', declineHeld: true } as const;
  // Back to what Outlook already has: nothing to send.
  assert.equal(planRsvpClick('accepted', held).kind, 'restore');
  assert.equal(planRsvpClick('tentative', held).kind, 'send');
  assert.equal(planRsvpClick('declined', held).kind, 'ignore');
});

test('nothing while a response is on its way', () => {
  assert.equal(planRsvpClick('declined', { ...idle, sending: true }).kind, 'ignore');
});

test('after a decline the meeting is gone: the newest answer left is shown', () => {
  const sentHere = { response: 'declined', at: 200 } as const;
  const repliedInOutlook = { response: 'accepted', at: 300 } as const;
  // On the calendar: the calendar's answer wins.
  assert.equal(shownResponse('accepted', true, sentHere, null), 'accepted');
  assert.equal(shownResponse('none', false, sentHere, null), 'declined');
  assert.equal(shownResponse('none', false, undefined, sentHere), 'declined');
  assert.equal(shownResponse('none', false, sentHere, repliedInOutlook), 'accepted');
  assert.equal(shownResponse('none', false, undefined, null), 'none');
});

test('the answer from your own reply in the conversation', () => {
  const me = ['Ralshawa2@washcoll.edu'];
  const invite = { id: 'inv', timestamp: 100 };
  const items = [
    {
      id: 'inv',
      type: 'message',
      timestamp: 100,
      from: { email: 'org@x.com' },
      meeting: { kind: 'request' }
    },
    // Someone else's reply says nothing about yours.
    {
      id: 'r1',
      type: 'message',
      timestamp: 150,
      from: { email: 'dean@washcoll.edu' },
      meeting: { kind: 'accepted' }
    },
    {
      id: 'r2',
      type: 'message',
      timestamp: 200,
      from: { email: 'ralshawa2@washcoll.edu' },
      meeting: { kind: 'tentative' }
    },
    {
      id: 'r3',
      type: 'message',
      timestamp: 300,
      from: { email: 'ralshawa2@washcoll.edu' },
      meeting: { kind: 'declined' }
    },
    // A plain email from you is not an answer.
    { id: 'm4', type: 'message', timestamp: 400, from: { email: 'ralshawa2@washcoll.edu' } }
  ];
  assert.deepEqual(answerFromThread(items, invite, me), { response: 'declined', at: 300 });
  // A reply from before this invitation (an earlier version of it) doesn't count.
  assert.equal(answerFromThread(items, { id: 'inv2', timestamp: 500 }, me), null);
  assert.equal(answerFromThread(items, invite, []), null);
});

test('remembered answers keep the latest', () => {
  let answers = {};
  for (let i = 0; i < 5; i++) answers = rememberAnswer(answers, `m${i}`, 'accepted', i, 3);
  assert.deepEqual(Object.keys(answers).sort(), ['m2', 'm3', 'm4']);
});

test('a reply about another occurrence of the series is not this invite’s answer', () => {
  const me = ['me@washcoll.edu'];
  const invite = { id: 'inv', timestamp: 100, start: '2026-03-10T15:00:00Z' };
  const items = [
    {
      id: 'a',
      type: 'message',
      timestamp: 200,
      from: { email: 'me@washcoll.edu' },
      meeting: { kind: 'declined', start: '2026-03-10T15:00:00Z' }
    },
    {
      id: 'b',
      type: 'message',
      timestamp: 300,
      from: { email: 'me@washcoll.edu' },
      meeting: { kind: 'accepted', start: '2026-03-17T15:00:00Z' }
    }
  ];
  assert.deepEqual(answerFromThread(items, invite, me), { response: 'declined', at: 200 });
  // A reply without a known time still counts.
  const noTime = [
    {
      id: 'c',
      type: 'message',
      timestamp: 250,
      from: { email: 'me@washcoll.edu' },
      meeting: { kind: 'tentative' }
    }
  ];
  assert.deepEqual(answerFromThread(noTime, invite, me), { response: 'tentative', at: 250 });
});

test('Graph errors that mean the meeting left the calendar', () => {
  assert.equal(isMeetingGoneError({ status: 404 }), true);
  assert.equal(
    isMeetingGoneError({
      status: 400,
      data: {
        error: { message: 'This operation does not support binding to a non-calendar folder.' }
      }
    }),
    true
  );
  assert.equal(
    isMeetingGoneError({ status: 400, data: { error: { message: 'Bad request' } } }),
    false
  );
  assert.equal(isMeetingGoneError({ status: 500 }), false);
  assert.equal(isMeetingGoneError(new Error('offline')), false);
});

test('an all-day reply a time-zone offset away is the same occurrence', () => {
  const me = ['me@washcoll.edu'];
  const invite = { id: 'inv', timestamp: 100, start: '2026-11-10T00:00:00Z' };
  const items = [
    {
      id: 'r',
      type: 'message',
      timestamp: 200,
      from: { email: 'me@washcoll.edu' },
      meeting: { kind: 'declined', start: '2026-11-09T23:00:00Z' }
    }
  ];
  assert.deepEqual(answerFromThread(items, invite, me), { response: 'declined', at: 200 });
});
