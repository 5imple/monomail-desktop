import log from 'electron-log';
import { graphApiClient } from '@/main/api/apiClient';
import {
  GraphMessage,
  transformGraphMessage,
  transformGraphThread,
  wellKnownFolderToLabel
} from '@/main/api/mail/graphTransforms';
import {
  googleMailProvider,
  MailProviderAdapter
} from '@/main/api/mail/providers/googleMailProvider';

// Fields the list view needs (no body — kept lightweight, like Gmail's
// format=metadata list). `from`/`sender` cover delegated/shared mailboxes.
const LIST_SELECT =
  'id,conversationId,internetMessageId,parentFolderId,subject,bodyPreview,from,sender,' +
  'toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,flag,hasAttachments,categories';

// Detail view adds the body, bcc, and headers. internetMessageHeaders is kept
// for reply threading; uniqueBody is fetched for the eventual reply-fragment path.
const DETAIL_SELECT = `${LIST_SELECT},body,bccRecipients,internetMessageHeaders`;
const ATTACHMENT_EXPAND = 'attachments($select=id,name,contentType,size,isInline,contentId)';

// Gmail label / `in:` token → Graph well-known folder. Drafts is intentionally
// absent (M365 plan A5: Microsoft compose drafts are local-only).
const FOLDER_BY_LABEL: Record<string, string> = {
  INBOX: 'inbox',
  SENT: 'sentitems',
  TRASH: 'deleteditems',
  SPAM: 'junkemail',
  JUNK: 'junkemail'
};

interface GraphListResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
}

const GRAPH_NEXTLINK = /^https:\/\/graph\.microsoft\.com\//i;

/**
 * v1 Gmail-query → Graph translation. Handles the folder + read/flag tokens the
 * unified inbox actually emits today; anything else falls back to Inbox. The
 * full search-query translation (customSearch / convertToAccurateQuery) is the
 * A13 sweep, tracked for Phase 6/13 — unhandled tokens are logged, not dropped
 * silently.
 */
function translateQuery(q: string): { folder: string; filter?: string } {
  const token = (q.match(/(?:label|in):(\S+)/i)?.[1] ?? '').toUpperCase();
  const folder = FOLDER_BY_LABEL[token] ?? 'inbox';

  const filters: string[] = [];
  if (/is:unread|label:UNREAD/i.test(q)) filters.push('isRead eq false');
  if (/is:starred|label:STARRED/i.test(q)) filters.push("flag/flagStatus eq 'flagged'");

  if (q && !token && !/is:(unread|starred)/i.test(q)) {
    log.info(`[microsoftMailProvider] query "${q}" not translated — defaulting to Inbox (A13).`);
  }
  return { folder, filter: filters.length ? filters.join(' and ') : undefined };
}

function groupByConversation(messages: GraphMessage[]): GraphMessage[][] {
  const byConversation = new Map<string, GraphMessage[]>();
  for (const message of messages) {
    const key = message.conversationId ?? message.id;
    const bucket = byConversation.get(key);
    if (bucket) bucket.push(message);
    else byConversation.set(key, [message]);
  }
  return Array.from(byConversation.values());
}

const getThreads: MailProviderAdapter['getThreads'] = async (
  uid,
  q,
  pageToken,
  maxResults,
  signal
) => {
  let path: string;
  let folderLabel: string | null;

  // An opaque @odata.nextLink continuation routes straight back through the
  // same Graph helper (origin-validated main-side). The folder is unknown on a
  // continuation, but each message still carries its folder:<id> label.
  if (pageToken && GRAPH_NEXTLINK.test(pageToken)) {
    path = pageToken;
    folderLabel = null;
  } else {
    const { folder, filter } = translateQuery(q ?? '');
    folderLabel = wellKnownFolderToLabel(folder);
    const params = new URLSearchParams({
      $select: LIST_SELECT,
      $top: maxResults || '25',
      $orderby: 'receivedDateTime desc'
    });
    if (filter) params.set('$filter', filter);
    path = `/me/mailFolders/${folder}/messages?${params.toString()}`;
  }

  const resp = await graphApiClient.get<GraphListResponse>(path, { uid, signal });
  const threads = groupByConversation(resp.value ?? [])
    .map((messages) => transformGraphThread(messages, uid, { folderLabel }))
    .sort((a, b) => b.timestamp - a.timestamp);

  return { threads, nextPageToken: resp['@odata.nextLink'] };
};

const getThread: MailProviderAdapter['getThread'] = async (uid, id, signal) => {
  // No Graph "thread" resource — a thread is a conversation. Fetch its messages
  // and let transformGraphThread sort + assemble them (no $orderby: combining it
  // with the conversationId filter trips Graph's "too complex" sort guard).
  const params = new URLSearchParams({
    $filter: `conversationId eq '${id.replace(/'/g, "''")}'`,
    $select: DETAIL_SELECT,
    $expand: ATTACHMENT_EXPAND
  });
  const resp = await graphApiClient.get<GraphListResponse>(`/me/messages?${params.toString()}`, {
    uid,
    signal
  });
  return transformGraphThread(resp.value ?? [], uid, { folderLabel: null });
};

const getMessage: MailProviderAdapter['getMessage'] = async (uid, id, signal) => {
  const params = new URLSearchParams({ $select: DETAIL_SELECT, $expand: ATTACHMENT_EXPAND });
  const raw = await graphApiClient.get<GraphMessage>(
    `/me/messages/${encodeURIComponent(id)}?${params.toString()}`,
    { uid, signal }
  );
  return transformGraphMessage(raw, { folderLabel: null });
};

function notImplemented(feature: string): never {
  throw new Error(
    `[microsoftMailProvider] ${feature} is not implemented yet — pending its M365 plan phase.`
  );
}

// Every adapter method defaults to NotImplemented; the read paths above are then
// layered on. Mutations (Phase 9), send (Phase 8), attachments (Phase 7), labels
// and history (Phase 10/11) fill in here as those phases land. While Microsoft
// accounts stay gated out of mail sync, these stubs are never reached.
const notImplementedAdapter = Object.fromEntries(
  Object.keys(googleMailProvider).map((name) => [name, () => notImplemented(name)])
) as unknown as MailProviderAdapter;

export const microsoftMailProvider: MailProviderAdapter = {
  ...notImplementedAdapter,
  getThreads,
  getThread,
  getMessage
};
