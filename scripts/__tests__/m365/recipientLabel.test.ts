import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAllWords, recipientLabel } from '@/renderer/app/lib/recipientLabel';

test('recipientLabel shows "Name (email)" for named contacts', () => {
  assert.equal(recipientLabel('Jennifer C. Hutton', 'jh@x.com'), 'Jennifer C. Hutton (jh@x.com)');
  assert.equal(recipientLabel('  Bob  ', 'b@x.com'), 'Bob (b@x.com)');
});

test('recipientLabel never repeats the address or leaves a dangling " (email)"', () => {
  assert.equal(
    recipientLabel('natalie.tjaden@jpmorgan.com', 'natalie.tjaden@jpmorgan.com'),
    'natalie.tjaden@jpmorgan.com'
  );
  assert.equal(recipientLabel('Support@Zendesk.com', 'support@zendesk.com'), 'support@zendesk.com');
  assert.equal(recipientLabel('', 'a@b.com'), 'a@b.com');
  assert.equal(recipientLabel('   ', 'a@b.com'), 'a@b.com');
  assert.equal(recipientLabel(undefined, 'a@b.com'), 'a@b.com');
});

test('matchesAllWords needs every typed word, in any order', () => {
  const value = 'Jennifer C. Hutton (jhutton@washcoll.edu)';
  assert.equal(matchesAllWords(value, 'jennifer hutton'), 1);
  assert.equal(matchesAllWords(value, 'hutton jen'), 1);
  assert.equal(matchesAllWords(value, 'washcoll'), 1);
  assert.equal(matchesAllWords(value, 'jennifer smith'), 0);
  assert.equal(matchesAllWords(value, '  '), 1);
});
