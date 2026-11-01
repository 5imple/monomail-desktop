import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDoneViewQuery,
  readerBackTarget,
  readerPosition
} from '@/renderer/app/lib/readerBackLabel';
import { senderFirstName } from '@/renderer/app/lib/senderFirstName';

// The reader's header: "← Inbox", "3 of 42+", and the reply box's "Reply to Jane…".

test('Back names the view it returns to', () => {
  assert.equal(readerBackTarget('MAIL', 'category:primary', false), 'inbox');
  assert.equal(readerBackTarget('MAIL', ' in:inbox ', false), 'inbox');
  assert.equal(readerBackTarget('MAIL', '', false), 'inbox');
  assert.equal(readerBackTarget('LATER', 'category:primary', false), 'later');
  assert.equal(readerBackTarget('MAIL', 'in:sent', false), 'sent');
  assert.equal(readerBackTarget('MAIL', 'is:starred', false), 'starred');
  assert.equal(readerBackTarget('MAIL', 'in:trash', false), 'trash');
  assert.equal(readerBackTarget('MAIL', 'from:alice budget', true), 'results');
  assert.equal(readerBackTarget('MAIL', 'label:advising', false), 'back');
  // Opened from Later (the reader runs under MAIL, the return layout is LATER).
  assert.equal(readerBackTarget('LATER', 'category:primary', false), 'later');
  // A search that starts with a category is still a search.
  assert.equal(readerBackTarget('MAIL', 'category:promotions coupon', true), 'results');
  assert.equal(readerBackTarget('MAIL', 'category:promotions', false), 'inbox');
});

test('position: one-based, "+" while more can load, empty when not listed', () => {
  assert.equal(readerPosition(2, 42, false), '3 of 42');
  assert.equal(readerPosition(0, 25, true), '1 of 25+');
  assert.equal(readerPosition(-1, 25, false), '');
  assert.equal(readerPosition(0, 0, false), '');
});

test('first name for "Reply to …"', () => {
  assert.equal(senderFirstName({ name: 'Jane Smith', email: 'jsmith@washcoll.edu' }), 'Jane');
  assert.equal(
    senderFirstName({ name: 'Alshawa, Roushdy N.', email: 'r@washcoll.edu' }),
    'Roushdy'
  );
  assert.equal(senderFirstName({ name: '"Jane Smith"', email: 'j@x.org' }), 'Jane');
  assert.equal(
    senderFirstName({ name: 'no-reply@status.io', email: 'no-reply@status.io' }),
    'no-reply'
  );
  assert.equal(senderFirstName({ email: 'registrar@washcoll.edu' }), 'registrar');
  assert.equal(senderFirstName(null), '');
  assert.equal(senderFirstName({ name: "D'Andre Jones" }), "D'Andre");
  assert.equal(senderFirstName({ name: 'Jane Smith, PhD' }), 'Jane');
});

test('E moves an email back to the Inbox only from the Done view', () => {
  assert.equal(isDoneViewQuery('not in:inbox'), true);
  assert.equal(isDoneViewQuery(' in:archive '), true);
  assert.equal(isDoneViewQuery('in:sent'), false);
  assert.equal(isDoneViewQuery('is:starred'), false);
  assert.equal(isDoneViewQuery('in:trash'), false);
  assert.equal(isDoneViewQuery('from:alice'), false);
  assert.equal(isDoneViewQuery('category:primary'), false);
});
