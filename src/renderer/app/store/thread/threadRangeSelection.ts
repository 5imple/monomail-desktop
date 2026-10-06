/**
 * Shift-range selection for the thread list, shared by the mouse (Shift+click,
 * Shift+sweep) and the keyboard (Shift+↑/↓).
 *
 * A "gesture" lasts while Shift is held. When it starts it captures the
 * selection so far (the base) and an anchor; every step then selects
 * base ∪ [anchor … target], so moving back toward the anchor shrinks the range
 * again without losing rows picked earlier with ⌘-click or the checkbox.
 * Releasing Shift ends the gesture; pressing it again while the selection is
 * still what that gesture made resumes it (Finder-style), so Shift+↓ then
 * Shift+↑ shrinks the range even if Shift was let go in between.
 *
 * Plain module state on purpose: nothing renders from it, and both the list
 * and the keyboard-navigation hook must see the same gesture.
 */

let anchorId: string | null = null;
type Gesture = { base: string[]; anchor: string; result: string[] | null };
let gesture: Gesture | null = null;
let lastGesture: Gesture | null = null;

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/** The row future Shift ranges grow from (last opened / toggled row). */
export function setSelectionAnchor(threadId: string | null) {
  anchorId = threadId;
  lastGesture = null;
}

export function isRangeGestureActive() {
  return gesture !== null;
}

/**
 * Starts a gesture unless one is running. With rows already selected the
 * range grows from the remembered anchor (or the last selected row);
 * otherwise from `fallbackAnchor` — the row the gesture began on.
 */
export function beginRangeGesture(current: string[], order: string[], fallbackAnchor: string) {
  if (gesture) return;
  if (
    lastGesture?.result &&
    sameIds(lastGesture.result, current) &&
    order.includes(lastGesture.anchor)
  ) {
    gesture = { ...lastGesture };
    return;
  }
  let anchor = fallbackAnchor;
  if (current.length > 0) {
    if (anchorId && order.includes(anchorId)) anchor = anchorId;
    else anchor = [...current].reverse().find((id) => order.includes(id)) ?? fallbackAnchor;
  }
  gesture = { base: current, anchor, result: null };
}

/** The selection for the gesture reaching `targetId`, or null without one. */
export function rangeGestureSelection(order: string[], targetId: string): string[] | null {
  if (!gesture) return null;
  const result = unionRange(order, gesture.anchor, targetId, gesture.base);
  if (result) gesture.result = result;
  return result;
}

export function endRangeGesture() {
  if (gesture) {
    anchorId = gesture.anchor;
    lastGesture = gesture;
  }
  gesture = null;
}

/** base ∪ the rows between anchor and target (inclusive), in list order. */
export function unionRange(
  order: string[],
  anchor: string,
  target: string,
  base: string[]
): string[] | null {
  const a = order.indexOf(anchor);
  const b = order.indexOf(target);
  if (a < 0 || b < 0) return null;
  const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
  const seen = new Set(base);
  return [...base, ...range.filter((id) => !seen.has(id))];
}
