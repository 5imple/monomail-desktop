import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReplyAllRecipients,
  buildReplyRecipients,
  replySubject,
  replyTargets
} from '@/renderer/app/lib/replyRecipients';

const r = (email: string) => ({ email });

test('reply all puts the sender and To on To, keeps Cc, and drops your own addresses', () => {
  assert.deepEqual(
    buildReplyAllRecipients(
      {
        from: r('kait@ellucian.com'),
        to: [r('me@washcoll.edu'), r('sam@x.com')],
        cc: [r('lee@x.com')]
      },
      ['me@washcoll.edu']
    ),
    { to: ['kait@ellucian.com', 'sam@x.com'], cc: ['lee@x.com'] }
  );
});

test('reply all to your own message goes to its original recipients', () => {
  assert.deepEqual(
    buildReplyAllRecipients(
      { from: r('Me@WashColl.edu'), to: [r('kait@ellucian.com')], cc: [r('me@washcoll.edu')] },
      ['me@washcoll.edu', 'alt@gmail.com']
    ),
    { to: ['kait@ellucian.com'], cc: [] }
  );
});

test('each address appears once, case-insensitively, To winning over Cc', () => {
  assert.deepEqual(
    buildReplyAllRecipients(
      {
        from: r('A@x.com'),
        to: [r('a@x.com'), r('b@x.com'), r(' ')],
        cc: [r('B@x.com'), r('c@x.com'), r('c@x.com')]
      },
      []
    ),
    { to: ['A@x.com', 'b@x.com'], cc: ['c@x.com'] }
  );
});

test('replySubject adds one Re: prefix', () => {
  assert.equal(replySubject('Changing Banking'), 'Re: Changing Banking');
  assert.equal(replySubject('RE: Changing Banking'), 'RE: Changing Banking');
});

test('plain reply goes to the sender; to your own message, to its recipients', () => {
  const own = ['Me@WashColl.edu'];
  assert.deepEqual(
    buildReplyRecipients({ from: r('sabine@x.org'), to: [r('me@washcoll.edu')] }, own),
    ['sabine@x.org']
  );
  assert.deepEqual(
    buildReplyRecipients({ from: r(' me@washcoll.edu'), to: [r('a@x.org'), r('b@x.org')] }, own),
    ['a@x.org', 'b@x.org']
  );
});

test('reply answers the latest message from someone else, case-insensitively', () => {
  const m = (id: string, email: string) => ({ id, from: { email } });
  const messages = [
    m('1', 'sabine@x.org'),
    m('2', 'ME@washcoll.edu'),
    m('3', 'bob@x.org'),
    m('4', 'me@washcoll.edu')
  ];
  const { replyTarget, latest, fromOthers } = replyTargets(messages, ['me@washcoll.edu']);
  assert.equal(replyTarget?.id, '3');
  assert.equal(latest?.id, '4');
  assert.equal(fromOthers, true);
  // Only your own messages: your latest, so the reply goes to its recipients.
  const mine = replyTargets(
    [m('1', 'me@washcoll.edu'), m('2', 'Me@washcoll.edu')],
    ['me@washcoll.edu']
  );
  assert.equal(mine.replyTarget?.id, '2');
  assert.equal(mine.fromOthers, false);
  assert.deepEqual(replyTargets([], ['me@washcoll.edu']), {
    replyTarget: null,
    latest: null,
    fromOthers: false
  });
});
