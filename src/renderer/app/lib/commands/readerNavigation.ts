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
