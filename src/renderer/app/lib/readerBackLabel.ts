// Kept free of app imports so it runs in the tests (useIsSearchView's module
// needs a window): the inbox queries, with Gmail's category tabs (MailNavTabs).
const INBOX_VIEW_QUERIES = new Set([
  'category:primary',
  'in:inbox',
  'category:social',
  'category:promotions',
  'category:updates',
  'category:forums'
]);
const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Which view the reader's Back button returns to, for its label
 * ("← Inbox", "← Sent"…). 'back' when the view has no short name (a label,
 * a folder from the sidebar), 'results' for a search.
 */
export type ReaderBackTarget =
  | 'inbox'
  | 'later'
  | 'starred'
  | 'sent'
  | 'drafts'
  | 'done'
  | 'trash'
  | 'spam'
  | 'results'
  | 'back';

const VIEW_BY_QUERY: Record<string, ReaderBackTarget> = {
  'is:snoozed': 'later',
  'is:starred': 'starred',
  'in:sent': 'sent',
  'in:draft': 'drafts',
  'not in:inbox': 'done',
  'in:trash': 'trash',
  'in:spam': 'spam'
};

export function readerBackTarget(
  activeLayout: string,
  query: string,
  isSearch: boolean
): ReaderBackTarget {
  if (activeLayout === 'LATER') return 'later';
  const q = normalizeQuery(query ?? '');
  if (!q || INBOX_VIEW_QUERIES.has(q)) return 'inbox';
  if (VIEW_BY_QUERY[q]) return VIEW_BY_QUERY[q];
  return isSearch ? 'results' : 'back';
}

/**
 * A view of mail that's already done (archived), where E moves an email back
 * to the Inbox. Elsewhere (Sent, Starred, Trash, a label, a search) an email
 * outside the Inbox isn't "done" by you, and E must not pull it in.
 */
export function isDoneViewQuery(query: string): boolean {
  const q = normalizeQuery(query ?? '');
  return q === 'not in:inbox' || q === 'in:archive';
}

/**
 * Where the open email sits in the list: "3 of 42", "3 of 42+" while more
 * can load. Empty when it isn't in the list (opened from a search result
 * since replaced, a draft…).
 */
export function readerPosition(index: number, total: number, hasMore: boolean): string {
  if (index < 0 || total <= 0) return '';
  return `${index + 1} of ${total}${hasMore ? '+' : ''}`;
}
