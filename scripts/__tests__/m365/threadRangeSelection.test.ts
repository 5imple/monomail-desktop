import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  beginRangeGesture,
  endRangeGesture,
  isRangeGestureActive,
  rangeGestureSelection,
  setSelectionAnchor,
  unionRange
} from '@/renderer/app/store/thread/threadRangeSelection';

const order = ['a', 'b', 'c', 'd', 'e', 'f'];

test('unionRange selects inclusive ranges in either direction on top of the base', () => {
  assert.deepEqual(unionRange(order, 'b', 'd', []), ['b', 'c', 'd']);
  assert.deepEqual(unionRange(order, 'd', 'b', []), ['b', 'c', 'd']);
  assert.deepEqual(unionRange(order, 'c', 'c', []), ['c']);
  assert.deepEqual(unionRange(order, 'c', 'd', ['f', 'c']), ['f', 'c', 'd']);
  assert.equal(unionRange(order, 'x', 'b', []), null);
});

test('a gesture without a selection grows from where it began, and shrinks back', () => {
  endRangeGesture();
  setSelectionAnchor(null);
  beginRangeGesture([], order, 'b');
  assert.ok(isRangeGestureActive());
  assert.deepEqual(rangeGestureSelection(order, 'e'), ['b', 'c', 'd', 'e']);
  assert.deepEqual(rangeGestureSelection(order, 'c'), ['b', 'c']);
  // A second begin while Shift is still held is ignored.
  beginRangeGesture(['b', 'c'], order, 'f');
  assert.deepEqual(rangeGestureSelection(order, 'a'), ['a', 'b']);
  endRangeGesture();
  assert.equal(rangeGestureSelection(order, 'a'), null);
});

test('a gesture keeps earlier picks and grows from the remembered anchor', () => {
  endRangeGesture();
  setSelectionAnchor('d');
  beginRangeGesture(['a', 'd'], order, 'f');
  assert.deepEqual(rangeGestureSelection(order, 'f'), ['a', 'd', 'e', 'f']);
  endRangeGesture();
  // Anchor gone from the list: fall back to the last selected row still there.
  setSelectionAnchor('zz');
  beginRangeGesture(['b', 'e'], order, 'a');
  assert.deepEqual(rangeGestureSelection(order, 'c'), ['b', 'e', 'c', 'd']);
  endRangeGesture();
});

test('pressing Shift again resumes the last gesture while its selection is untouched', () => {
  endRangeGesture();
  setSelectionAnchor(null);
  beginRangeGesture([], order, 'b');
  const grown = rangeGestureSelection(order, 'e')!;
  endRangeGesture();
  // Shift released and pressed again: moving back shrinks the same range.
  beginRangeGesture(grown, order, 'e');
  assert.deepEqual(rangeGestureSelection(order, 'c'), ['b', 'c']);
  endRangeGesture();
  // A selection changed in between (⌘-click sets the anchor) starts afresh.
  setSelectionAnchor('f');
  beginRangeGesture(['b', 'c', 'f'], order, 'f');
  assert.deepEqual(rangeGestureSelection(order, 'e'), ['b', 'c', 'f', 'e']);
  endRangeGesture();
});
