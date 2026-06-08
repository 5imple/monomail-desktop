import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isComposeDraftId, generateUUID } from '@/main/utils';

// A2 correctness guard: the predicate must classify compose UUIDs as drafts and
// real provider ids (Gmail short-hex, Graph long base64url) as NOT drafts.

test('isComposeDraftId: compose UUIDs are drafts', () => {
  assert.equal(isComposeDraftId('123e4567-e89b-42d3-a456-426614174000'), true);
  for (let i = 0; i < 50; i++) assert.equal(isComposeDraftId(generateUUID()), true);
});

test('isComposeDraftId: Gmail ids (~16 hex) are NOT drafts', () => {
  assert.equal(isComposeDraftId('18e0f4a2b1c3d5e6'), false);
  assert.equal(isComposeDraftId('1846a2b9cd00ff12'), false);
});

test('isComposeDraftId: Graph immutable ids (~150 base64url) are NOT drafts', () => {
  const graphId =
    'AAMkAGI2TG93AAA=AQACAAA-' + 'Zx9_aB-cD0eF1gH2iJ3kL4mN5oP6qR7sT8uV9wX0yZ'.repeat(3);
  assert.ok(graphId.length > 100);
  assert.equal(isComposeDraftId(graphId), false);
});

test('isComposeDraftId: edge cases', () => {
  assert.equal(isComposeDraftId(''), false);
  assert.equal(isComposeDraftId(null), false);
  assert.equal(isComposeDraftId(undefined), false);
  // 36 chars but not UUID-shaped (the old `=== 36` heuristic would mis-fire here).
  assert.equal(isComposeDraftId('x'.repeat(36)), false);
  // UUID without dashes must not match.
  assert.equal(isComposeDraftId('123e4567e89b42d3a456426614174000'), false);
});
