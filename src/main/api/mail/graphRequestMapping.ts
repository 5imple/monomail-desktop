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

/** The well-known folders that decide which messages of a conversation move. */
export const MOVE_FOLDERS = [
  'inbox',
  'archive',
  'sentitems',
  'drafts',
  'outbox',
  'deleteditems',
  'junkemail'
] as const;
export type MoveFolder = (typeof MOVE_FOLDERS)[number];
/** Their folder ids (absent for one the mailbox doesn't have). */
export type MoveFolderIds = Partial<Record<MoveFolder, string>>;

/** A conversation message and the folder it is in. */
export interface FolderedMessage {
  id: string;
  parentFolderId?: string;
}

/**
 * Which messages of a conversation a planned move (planMutation's moveTo)
 * applies to. A conversation spans folders and Graph moves one message at a
 * time, so moving all of them went wrong twice over: Exchange refuses to move a
 * message into the folder it is already in (500 "The move or copy operation
 * failed"), so Done failed whenever part of the conversation was already
 * archived; and your own replies left Sent Items. A move takes the messages
 * that carry the label it changes, and skips any already where it's going:
 *  - Done (remove INBOX): the Inbox copies.
 *  - Back to the Inbox (add INBOX): the archived and filed copies — not the
 *    ones in Sent Items, Drafts, Outbox, Deleted Items or Junk.
 *  - Out of Trash / Junk (remove TRASH / SPAM): the copies in there.
 *  - To Trash, Junk or a folder: every copy not already there.
 */
export function selectMessagesToMove(
  messages: FolderedMessage[],
  moveTo: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  folders: MoveFolderIds
): string[] {
  const isIn = (message: FolderedMessage, folderId: string | undefined) =>
    !!folderId && message.parentFolderId === folderId;
  const destination = (MOVE_FOLDERS as readonly string[]).includes(moveTo)
    ? folders[moveTo as MoveFolder]
    : moveTo;

  let candidates = messages;
  if (moveTo === 'archive') {
    candidates = messages.filter((m) => isIn(m, folders.inbox));
  } else if (moveTo === 'inbox') {
    const add = new Set(addLabelIds);
    const remove = new Set(removeLabelIds);
    const staysPut = [
      folders.inbox,
      folders.sentitems,
      folders.drafts,
      folders.outbox,
      folders.deleteditems,
      folders.junkemail
    ];
    candidates = messages.filter(
      (m) =>
        (remove.has('TRASH') && isIn(m, folders.deleteditems)) ||
        (remove.has('SPAM') && isIn(m, folders.junkemail)) ||
        (add.has('INBOX') && !staysPut.some((folderId) => isIn(m, folderId)))
    );
  }
  return candidates.filter((m) => !isIn(m, destination)).map((m) => m.id);
}

/**
 * buildRawMessage emits the envelope as base64url with padding stripped; Graph's
 * MIME sendMail wants standard base64 — restore the +/ alphabet and re-pad.
 */
export function base64UrlToBase64(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
}

export type GraphDeltaErrorStatus = 'reset' | 'retry' | 'expired' | 'error';

// Graph error codes that mean the stored deltaLink is unusable and a FULL resync
// is required. syncStateNotFound is a 4xx (NOT 410) and is the common cursor-
// expiry case — mapping only on status 410 would leave the cursor wedged.
const DELTA_RESET_CODES = new Set([
  'syncstatenotfound',
  'resyncrequired',
  'synchronizationrestart'
]);

/**
 * Classifies a failed delta request into a recovery action: `reset` → drop the
 * cursor and full-resync; `retry` → throttled, keep cursor; `expired` → auth
 * failure, keep cursor; `error` → transient (5xx/network), keep cursor.
 */
export function classifyGraphDeltaError(
  status?: number,
  errorCode?: string
): GraphDeltaErrorStatus {
  const code = (errorCode ?? '').toLowerCase();
  if (status === 410 || DELTA_RESET_CODES.has(code)) return 'reset';
  if (status === 429) return 'retry';
  if (status === 401 || status === 403) return 'expired';
  return 'error';
}

export interface GraphSearchPlan {
  /** The KQL for `$search` (unquoted; graphSearchParam quotes it). */
  kql: string;
  /** Well-known folder to search in, when the query named one (in:inbox). */
  folder?: string;
  /** Read / flag conditions applied to the results ($search can't take $filter). */
  unreadOnly: boolean;
  flaggedOnly: boolean;
}

// Gmail-style operators that map onto Exchange KQL properties.
const KQL_PROPERTY: Record<string, string> = {
  from: 'from',
  to: 'to',
  cc: 'cc',
  bcc: 'bcc',
  subject: 'subject'
};

// Tokens of a query: quoted phrases stay whole ("weekly report", from:"Ann Lee").
const tokenize = (q: string): string[] => q.match(/-?[\w.:-]*"[^"]*"|\S+/g) ?? [];

const quoteIfNeeded = (value: string) =>
  /^".*"$/.test(value) || !/\s/.test(value) ? value : `"${value}"`;

// after:2024/01/31 (Gmail) -> 2024-01-31 (KQL date). Null when not a date.
const kqlDate = (value: string): string | null => {
  const m = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
};

/**
 * A free-text / operator search as a Graph `$search` (KQL) plan, or null when
 * the query is only a view (in:inbox, is:unread, category:primary…), which the
 * folder listing (translateQuery) serves. Before this, every search on a
 * Microsoft account listed the Inbox and dropped the words, so "invoice acme"
 * showed the newest inbox mail instead of matches.
 */
export function buildGraphSearch(q: string): GraphSearchPlan | null {
  const clauses: string[] = [];
  let folder: string | undefined;
  let unreadOnly = false;
  let flaggedOnly = false;

  let negateNext = false;
  // Terms that ask for something. Exclusions alone ("label:INBOX AND
  // -from:x", which is how the Primary view reaches the provider) keep the
  // query a view.
  let positive = 0;
  const add = (clause: string, negated: boolean) => {
    clauses.push(negated ? `NOT ${clause}` : clause);
    if (!negated) positive += 1;
  };
  for (const token of tokenize(q.trim())) {
    // Boolean operators: NOT applies to the next term (so "NOT in:inbox", the
    // Done view, stays a view); AND / OR pass through between search terms.
    if (token === 'NOT') {
      negateNext = true;
      continue;
    }
    if (token === 'AND' || token === 'OR') {
      if (clauses.length > 0 && !/^(AND|OR)$/.test(clauses[clauses.length - 1])) {
        clauses.push(token);
      }
      continue;
    }
    const negated = token.startsWith('-') || negateNext;
    negateNext = false;
    const body = token.startsWith('-') ? token.slice(1) : token;
    const colon = body.indexOf(':');
    const key = colon > 0 ? body.slice(0, colon).toLowerCase() : '';
    const value = colon > 0 ? body.slice(colon + 1) : body;

    if (key === 'in' || key === 'label') {
      const mapped = FOLDER_BY_LABEL[value.toUpperCase()];
      if (mapped && !negated) folder = mapped;
      continue; // in:anywhere / in:all / labels: search everywhere
    }
    if (key === 'is') {
      if (value.toLowerCase() === 'unread' && !negated) unreadOnly = true;
      if (value.toLowerCase() === 'starred' && !negated) flaggedOnly = true;
      continue;
    }
    if (key === 'category') continue; // Gmail tabs: no Outlook equivalent
    if (key === 'has') {
      if (value.toLowerCase().startsWith('attachment')) {
        add('hasAttachments:true', negated);
      }
      continue;
    }
    if (key === 'after' || key === 'before' || key === 'newer' || key === 'older') {
      const date = kqlDate(value);
      if (date) {
        add(`received${key === 'after' || key === 'newer' ? '>=' : '<'}${date}`, negated);
      }
      continue;
    }
    if (KQL_PROPERTY[key]) {
      if (value) add(`${KQL_PROPERTY[key]}:${quoteIfNeeded(value)}`, negated);
      continue;
    }
    // Free text (an unknown "word:thing" is searched as text too).
    if (body) add(body, negated);
  }

  while (clauses.length > 0 && /^(AND|OR)$/.test(clauses[clauses.length - 1])) clauses.pop();
  if (positive === 0) return null;
  return { kql: clauses.join(' '), folder, unreadOnly, flaggedOnly };
}

/** `$search` takes the whole KQL in double quotes, inner quotes escaped. */
export const graphSearchParam = (kql: string) =>
  `"${kql.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
