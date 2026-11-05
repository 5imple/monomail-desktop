import type { FilterCriteria } from '@/renderer/app/types';

/**
 * The order of the filter tabs (All, Unread, With attachments and the custom
 * labels), as the user arranged them by dragging.
 */

export const BUILT_IN_TAB_IDS = ['all', 'unread', 'attachments'] as const;

/**
 * The tabs to show, in order: the saved order for the tabs that still exist,
 * then any tab it doesn't know yet (a new label goes last; the built-in tabs
 * come first when nothing has been moved).
 */
export function orderTabIds(saved: string[], existing: string[]): string[] {
  const exists = new Set(existing);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of saved) {
    if (exists.has(id) && !seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  for (const id of existing) {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}

/** The filters each built-in tab applies (All applies none). */
export const BUILT_IN_TAB_RULES: Record<(typeof BUILT_IN_TAB_IDS)[number], FilterCriteria[]> = {
  all: [],
  unread: [{ type: 'read_status', value: 'unread', operator: 'is' }],
  attachments: [{ type: 'attachment', value: undefined, operator: 'has' }]
};

/**
 * The order to save after dragging the shown tab at `from` to `to`. Ids in
 * the saved order that aren't shown now (a label just deleted, which Undo
 * can bring back) keep their place after the tab they followed, so a
 * restored label returns where it was.
 */
export function moveTabId(saved: string[], shown: string[], from: number, to: number): string[] {
  const moved = [...shown];
  const [tab] = moved.splice(from, 1);
  moved.splice(to, 0, tab);

  const isShown = new Set(shown);
  for (let i = 0; i < saved.length; i++) {
    const id = saved[i];
    if (isShown.has(id) || moved.includes(id)) continue;
    // After the nearest earlier saved id that is in the new order.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const index = moved.indexOf(saved[j]);
      if (index >= 0) {
        at = index + 1;
        break;
      }
    }
    moved.splice(at, 0, id);
  }
  return moved;
}
