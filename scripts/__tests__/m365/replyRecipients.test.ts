import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReplyAllRecipients, replySubject } from '@/renderer/app/lib/replyRecipients';

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
