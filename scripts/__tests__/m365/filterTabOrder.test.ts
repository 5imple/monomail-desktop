import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_TAB_IDS, orderTabIds } from '@/renderer/app/lib/filterTabOrder';

// The filter tabs' order: All / Unread / With attachments and the custom
// labels, any of which can be dragged anywhere.

const existing = [...BUILT_IN_TAB_IDS, 'label-a', 'label-b'];

test('nothing moved yet: built-in tabs first, labels after', () => {
  assert.deepEqual(orderTabIds([], existing), [
    'all',
    'unread',
    'attachments',
    'label-a',
    'label-b'
  ]);
});

test('a label dragged before All stays there', () => {
  const saved = ['label-b', 'all', 'unread', 'attachments', 'label-a'];
  assert.deepEqual(orderTabIds(saved, existing), saved);
});

test('a new label goes last; a deleted one drops out', () => {
  const saved = ['label-b', 'all', 'unread', 'attachments', 'label-a'];
  assert.deepEqual(orderTabIds(saved, [...BUILT_IN_TAB_IDS, 'label-b', 'label-c']), [
    'label-b',
    'all',
    'unread',
    'attachments',
    'label-c'
  ]);
});

test('a deleted label restored by Undo gets its old place back', () => {
  const saved = ['all', 'label-a', 'unread', 'attachments', 'label-b'];
  const withoutA = orderTabIds(saved, [...BUILT_IN_TAB_IDS, 'label-b']);
  assert.deepEqual(withoutA, ['all', 'unread', 'attachments', 'label-b']);
  // The saved order wasn't rewritten by the delete, so A returns to 2nd.
  assert.deepEqual(orderTabIds(saved, existing), saved);
});

test('duplicates in a saved order are ignored', () => {
  assert.deepEqual(orderTabIds(['unread', 'unread', 'all'], [...BUILT_IN_TAB_IDS]), [
    'unread',
    'all',
    'attachments'
  ]);
});

test('reordering while a label is deleted keeps its place for Undo', async () => {
  const { moveTabId } = await import('@/renderer/app/lib/filterTabOrder');
  // B was dragged before All, then deleted (so not shown).
  const saved = ['label-b', 'all', 'unread', 'attachments'];
  const shown = ['all', 'unread', 'attachments'];
  // Drag Unread after With attachments while the Undo toast is up.
  const next = moveTabId(saved, shown, 1, 2);
  assert.deepEqual(next, ['label-b', 'all', 'attachments', 'unread']);
  // Undo brings B back first, where it was.
  assert.deepEqual(orderTabIds(next, [...BUILT_IN_TAB_IDS, 'label-b']), next);
});

test('moveTabId moves a shown tab like arrayMove', async () => {
  const { moveTabId } = await import('@/renderer/app/lib/filterTabOrder');
  const shown = ['all', 'unread', 'attachments', 'label-a'];
  assert.deepEqual(moveTabId([], shown, 3, 0), ['label-a', 'all', 'unread', 'attachments']);
  assert.deepEqual(moveTabId(shown, shown, 0, 2), ['unread', 'attachments', 'all', 'label-a']);
});
