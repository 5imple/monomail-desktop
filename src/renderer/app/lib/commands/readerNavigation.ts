/**
 * The conversation the reader shows once `leavingId` is taken out of the list
 * (archived, snoozed): the next one down, the one above when it was last, and
 * nothing when it was alone — the reader then closes. `ids` is the list in
 * its displayed order, measured while `leavingId` is still in it.
 */
export const neighbourAfterLeaving = (ids: readonly string[], leavingId: string): string | null => {
  const index = ids.indexOf(leavingId);
  if (index === -1) return null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
};

/**
 * The conversation one step from `activeId` in the displayed list: `1` the one
 * below (J / ↓ in the reader), `-1` the one above (K / ↑). No wrapping: at
 * either end there is no step (null). With nothing open, or the open one no
 * longer listed, the first conversation.
 */
export const stepConversation = (
  ids: readonly string[],
  activeId: string | null,
  direction: 1 | -1
): string | null => {
  if (ids.length === 0) return null;
  const index = activeId ? ids.indexOf(activeId) : -1;
  if (index === -1) return ids[0];
  return ids[index + direction] ?? null;
};

/**
 * Done / Trash / Spam / Later on the last email loaded while more of the list
 * is still on the server: the next page is fetched and the reader waits for
 * it, rather than going back up (the list can't page by itself while the
 * reader covers it). `after` is the email above the one leaving, where the
 * next page continues from; null when it was the only one loaded.
 */
export interface PendingAdvance {
  leavingId: string;
  after: string | null;
  /** Still in the list when the wait began (an action that doesn't take it out). */
  leavingListed: boolean;
}

export type AdvanceStep = { open: string | null } | 'wait';

/** Where the reader goes when `leavingId` leaves the list (see PendingAdvance). */
export const advanceAfterLeaving = (
  ids: readonly string[],
  leavingId: string,
  hasMore: boolean
): AdvanceStep => {
  const index = ids.indexOf(leavingId);
  if (index === -1) return { open: null };
  const below = ids[index + 1];
  if (below) return { open: below };
  if (hasMore) return 'wait';
  return { open: ids[index - 1] ?? null };
};

/**
 * While waiting: open the first email below `after` once the next page lands;
 * give up ('cancel') when the reader moved elsewhere or the email came back
 * (Undo); fall back to `after` when the list has no more to load.
 */
export const resolvePendingAdvance = (
  ids: readonly string[],
  pending: PendingAdvance,
  activeId: string | null,
  hasMore: boolean
): AdvanceStep | 'cancel' => {
  if (activeId !== pending.leavingId) return 'cancel';
  if (!pending.leavingListed && ids.includes(pending.leavingId)) return 'cancel';
  const afterIndex = pending.after === null ? -1 : ids.indexOf(pending.after);
  if (pending.after === null || afterIndex !== -1) {
    for (let i = afterIndex + 1; i < ids.length; i++) {
      if (ids[i] !== pending.leavingId) return { open: ids[i] };
    }
  }
  if (hasMore) return 'wait';
  const fallback =
    afterIndex !== -1
      ? pending.after
      : ([...ids].reverse().find((id) => id !== pending.leavingId) ?? null);
  return { open: fallback };
};

/** Close enough to the end of what's loaded to fetch the next page now. */
export const nearLoadedEnd = (ids: readonly string[], activeId: string | null, margin = 3) => {
  if (!activeId) return false;
  const index = ids.indexOf(activeId);
  return index !== -1 && index >= ids.length - 1 - margin;
};
