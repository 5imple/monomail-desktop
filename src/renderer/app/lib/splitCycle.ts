/**
 * Tab / Shift+Tab on the list move to the next / previous Inbox split, as in
 * Superhuman. The tabs (InboxFilterTabs) know their order and which one is
 * picked, keyboard navigation owns the Tab key: the tabs register here while
 * they're on screen, and the Tab handler asks them first.
 */

type SplitCycler = (step: 1 | -1) => boolean;

let cycler: SplitCycler | null = null;

/** Registers the tabs' cycler; returns the function that removes it. */
export function setSplitCycler(next: SplitCycler): () => void {
  cycler = next;
  return () => {
    if (cycler === next) cycler = null;
  };
}

/** Moves to the next / previous split. False when no split tabs are showing. */
export const cycleSplit = (step: 1 | -1): boolean => cycler?.(step) ?? false;
