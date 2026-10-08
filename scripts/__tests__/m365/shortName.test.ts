import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortName } from '@/renderer/app/lib/shortName';

test('shortName flips "Surname, Given" and keeps ordinary names', () => {
  assert.equal(shortName('Reneer, Kaitlyn', 'kaitlyn@x.com'), 'Kaitlyn');
  assert.equal(shortName('Ardigo, Robert J.', 'r@x.com'), 'Robert');
  assert.equal(shortName('Kate Ratigan', 'k@x.com'), 'Kate');
  assert.equal(shortName('John Smith, Jr.', 'j@x.com'), 'John');
});

test('shortName falls back to the email local-part', () => {
  assert.equal(shortName('', 'natalie.tjaden@jpmorgan.com'), 'natalie.tjaden');
  assert.equal(shortName(undefined, 'a@b.c'), 'a');
  assert.equal(shortName('   ', null), '');
});
