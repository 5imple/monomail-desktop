import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipientSummary } from '@/renderer/app/lib/recipientSummary';

const me = { name: 'Rami Alshawa', email: 'ralshawa2@washcoll.edu' };
const bob = { name: 'Bob Smith', email: 'bob@washcoll.edu' };
const carol = { name: 'Lee, Carol', email: 'clee@washcoll.edu' };
const dan = { name: '', email: 'dan.wu@example.com' };
const erin = { name: 'Erin Park', email: 'erin@example.com' };
const own = { ownEmails: ['RAlshawa2@WashColl.edu', 'rami@gmail.com'] };

test('your own addresses read as "me" (case-insensitive), others by first name', () => {
  const s = recipientSummary([me, bob], [], [], own);
  assert.equal(s.text, 'me, Bob');
  assert.equal(s.full, 'me, Bob Smith');
  assert.equal(s.total, 2);
  assert.equal(s.hidden, 0);
});

test('"Surname, Given" names and name-less addresses get short labels', () => {
  assert.equal(recipientSummary([carol, dan], null, null).text, 'Carol, dan.wu');
  assert.equal(recipientSummary([carol, dan], null, null).full, 'Carol Lee, dan.wu@example.com');
  // A display name that is really the address isn't a name.
  const s = recipientSummary([{ name: 'Erin@Example.com', email: 'erin@example.com' }], [], []);
  assert.equal(s.text, 'erin');
  assert.equal(s.full, 'erin@example.com');
});

test('three people are all named; four or more fold into "+N", Cc included', () => {
  assert.equal(recipientSummary([me, bob], [carol], [], own).text, 'me, Bob, Carol');
  const s = recipientSummary([me, bob], [carol, dan], [], own);
  assert.equal(s.text, 'me, Bob +2');
  assert.equal(s.total, 4);
  assert.equal(s.hidden, 2);
  assert.equal(s.full, 'me, Bob Smith, Carol Lee, dan.wu@example.com');
});

test('each person counts once; several of your addresses are one "me"', () => {
  const s = recipientSummary(
    [bob, { name: 'Rami', email: 'rami@gmail.com' }],
    [{ name: 'Bob', email: 'BOB@washcoll.edu' }, me],
    [],
    own
  );
  assert.equal(s.text, 'Bob, me');
  assert.equal(s.total, 2);
});

test('your own sent message names the other people', () => {
  assert.equal(recipientSummary([bob, erin], [], [], own).text, 'Bob, Erin');
});

test('Bcc recipients are marked once, after To and Cc', () => {
  assert.equal(recipientSummary([], [], [bob], own).text, 'bcc: Bob');
  assert.equal(recipientSummary([erin], [], [bob, carol], own).text, 'Erin, bcc: Bob, Carol');
  assert.equal(
    recipientSummary([erin], [], [bob, carol], own).full,
    'Erin Park, bcc: Bob Smith, Carol Lee'
  );
});

test('no recipients: empty, or "me" when the message reached you anyway', () => {
  const none = recipientSummary([], undefined, null, own);
  assert.deepEqual(none, { text: '', full: '', total: 0, hidden: 0 });
  assert.equal(recipientSummary([], [], [], { ...own, fallbackToMe: true }).text, 'me');
  // Entries with neither name nor address are skipped.
  assert.equal(recipientSummary([{ name: ' ', email: '' }], [], []).total, 0);
});

test('labels and limits are configurable', () => {
  const s = recipientSummary([me, bob, carol, dan, erin], [], [], {
    ...own,
    meLabel: 'moi',
    maxNames: 3,
    maxFullNames: 2
  });
  assert.equal(s.text, 'moi, Bob, Carol +2');
  assert.equal(s.full, 'moi, Bob Smith +3');
});

test('an empty group ("undisclosed-recipients:;") names nobody', () => {
  const group = { name: '', email: 'undisclosed-recipients:;' };
  assert.equal(recipientSummary([group], [], [], own).total, 0);
  assert.equal(recipientSummary([group], [], [], { ...own, fallbackToMe: true }).text, 'me');
  assert.equal(
    recipientSummary([{ name: 'Undisclosed recipients:', email: '' }], [], [], own).total,
    0
  );
  assert.equal(recipientSummary([group, bob], [], [], own).text, 'Bob');
});

test('quoted and multi-comma display names stay readable', () => {
  const s = recipientSummary(
    [
      { name: '"Bob Smith"', email: 'bob@washcoll.edu' },
      { name: 'Smith, John, Jr.', email: 'john@example.com' }
    ],
    [],
    []
  );
  assert.equal(s.text, 'Bob, John');
  assert.equal(s.full, 'Bob Smith, Smith, John, Jr.');
});

test('name-only recipients count once; Bcc to yourself reads "bcc: me"', () => {
  const s = recipientSummary(
    [{ name: 'Front Desk', email: '' }],
    [{ name: 'front desk', email: null }],
    [me],
    own
  );
  assert.equal(s.text, 'Front, bcc: me');
  assert.equal(s.total, 2);
});

test('exactly three people across To, Cc and Bcc are all named', () => {
  const s = recipientSummary([bob], [erin], [carol], own);
  assert.equal(s.text, 'Bob, Erin, bcc: Carol');
  assert.equal(s.hidden, 0);
});
