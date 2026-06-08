// Pure request-shaping helpers for the Microsoft Graph mail provider: Gmail-query
// → Graph folder/filter translation, Mono label mutation → Graph op planning, and
// the base64url→base64 envelope conversion for MIME sendMail. Kept free of any
// IO / electron / dompurify deps so it is trivially unit-testable.

// Gmail label / `in:` token → Graph well-known folder. Drafts is intentionally
// absent (M365 plan A5: Microsoft compose drafts are local-only).
export const FOLDER_BY_LABEL: Record<string, string> = {
  INBOX: 'inbox',
  SENT: 'sentitems',
  TRASH: 'deleteditems',
  SPAM: 'junkemail',
  JUNK: 'junkemail'
};

export interface TranslatedQuery {
  folder: string;
  filter?: string;
  // false when the query had content this v1 translator did not understand and
  // it fell back to Inbox — the caller logs it (A13 sweep is Phase 6/13).
  translated: boolean;
}

/**
 * v1 Gmail-query → Graph translation. Handles the folder + read/flag tokens the
 * unified inbox actually emits today; anything else falls back to Inbox. The full
 * search-query translation (customSearch / convertToAccurateQuery) is the A13
 * sweep, tracked for Phase 6/13.
 */
export function translateQuery(q: string): TranslatedQuery {
  const token = (q.match(/(?:label|in):(\S+)/i)?.[1] ?? '').toUpperCase();
  const folder = FOLDER_BY_LABEL[token] ?? 'inbox';

  const filters: string[] = [];
  if (/is:unread|label:UNREAD/i.test(q)) filters.push('isRead eq false');
  if (/is:starred|label:STARRED/i.test(q)) filters.push("flag/flagStatus eq 'flagged'");

  // "Understood" = we mapped a real folder token, or applied a read/flag filter.
  const translated = Boolean(FOLDER_BY_LABEL[token]) || filters.length > 0 || !q.trim();

  return { folder, filter: filters.length ? filters.join(' and ') : undefined, translated };
}

export interface GraphMutationPlan {
  patch?: Record<string, unknown>;
  moveTo?: string;
}

/**
 * Translates a Mono label mutation into Graph operations: read/flag become a
 * PATCH on the message; archive/trash/junk/restore/custom-folder become a move.
 * Archive resolves to the `archive` well-known name only — never a localized
 * display name (A11). Moves preserve the immutable id (A1).
 */
export function planMutation(addLabelIds: string[], removeLabelIds: string[]): GraphMutationPlan {
  const add = new Set(addLabelIds);
  const remove = new Set(removeLabelIds);

  const patch: Record<string, unknown> = {};
  if (add.has('UNREAD')) patch.isRead = false;
  if (remove.has('UNREAD')) patch.isRead = true;
  if (add.has('STARRED')) patch.flag = { flagStatus: 'flagged' };
  if (remove.has('STARRED')) patch.flag = { flagStatus: 'notFlagged' };

  const folderAdd = addLabelIds.find((l) => l.startsWith('folder:'));
  let moveTo: string | undefined;
  if (add.has('TRASH')) moveTo = 'deleteditems';
  else if (add.has('SPAM')) moveTo = 'junkemail';
  else if (folderAdd) moveTo = folderAdd.slice('folder:'.length);
  else if (add.has('INBOX') || remove.has('TRASH') || remove.has('SPAM')) moveTo = 'inbox';
  else if (remove.has('INBOX')) moveTo = 'archive';

  return { patch: Object.keys(patch).length ? patch : undefined, moveTo };
}

/**
 * buildRawMessage emits the envelope as base64url with padding stripped; Graph's
 * MIME sendMail wants standard base64 — restore the +/ alphabet and re-pad.
 */
export function base64UrlToBase64(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
}
