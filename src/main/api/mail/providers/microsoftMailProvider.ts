import log from 'electron-log';
import { graphApiClient, graphBatch } from '@/main/api/apiClient';
import {
  buildFolderLabelMap,
  GraphDeltaItem,
  GraphMessage,
  splitDeltaPage,
  transformGraphMessage,
  transformGraphThread,
  wellKnownFolderToLabel
} from '@/main/api/mail/graphTransforms';
import {
  googleMailProvider,
  MailProviderAdapter
} from '@/main/api/mail/providers/googleMailProvider';
import {
  base64UrlToBase64,
  classifyGraphDeltaError,
  planMutation,
  translateQuery
} from '@/main/api/mail/graphRequestMapping';

// Defensive cap on pagination loops so a malformed/looping server nextLink can
// never spin forever (Graph pages are ~10–1000 items; real result sets are far
// under this).
const MAX_PAGES = 100;

// Fields the list view needs (no body — kept lightweight, like Gmail's
// format=metadata list). `from`/`sender` cover delegated/shared mailboxes.
const LIST_SELECT =
  'id,conversationId,internetMessageId,parentFolderId,subject,bodyPreview,from,sender,' +
  'toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,flag,hasAttachments,categories';

// Detail view adds the body, bcc, and headers. internetMessageHeaders is kept
// for reply threading; uniqueBody is fetched for the eventual reply-fragment path.
const DETAIL_SELECT = `${LIST_SELECT},body,bccRecipients,internetMessageHeaders`;
// `contentId` is a `fileAttachment`-only property; selecting it on the
// polymorphic `attachments` collection makes Graph 400 the whole message GET
// ("Could not find a property named 'contentId' on type
// 'microsoft.graph.attachment'"), which blanks the message body. Select only the
// base-type properties. (Inline cid→image mapping that relied on contentId is a
// known follow-up: there's no OData way to select a derived-type property here
// without `$expand=attachments` pulling every attachment's contentBytes.)
const ATTACHMENT_EXPAND = 'attachments($select=id,name,contentType,size,isInline)';

interface GraphListResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
}

const GRAPH_NEXTLINK = /^https:\/\/graph\.microsoft\.com\//i;

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

// Graph's default /messages page size is 10, so any unpaged fetch silently
// truncates. Use the max page size and follow @odata.nextLink for fetches that
// must see EVERY message of a conversation (detail render + mutation fan-out).
const GRAPH_MAX_TOP = '1000';

async function fetchAllMessages(
  uid: string,
  initialPath: string,
  signal?: AbortSignal
): Promise<GraphMessage[]> {
  const all: GraphMessage[] = [];
  // The opaque nextLink is an absolute Graph URL; the IPC handler origin-
  // validates it, so routing it back through graphApiClient is safe.
  let path: string | undefined = initialPath;
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const resp: GraphListResponse = await graphApiClient.get<GraphListResponse>(path, {
      uid,
      signal
    });
    if (resp.value) all.push(...resp.value);
    path = resp['@odata.nextLink'];
  }
  return all;
}

// A folder-listing @odata.nextLink echoes the original request path
// (/me/mailFolders/<name>/messages...), so recover the well-known label from it
// — otherwise page-2+ threads carry only folder:<id> and drop out of the Inbox
// view (the renderer filters on the literal INBOX label).
function folderLabelFromNextLink(nextLink: string): string | null {
  const name = nextLink.match(/\/mailFolders\/([^/?]+)\/messages/i)?.[1];
  return wellKnownFolderToLabel(name ? decodeURIComponent(name) : null);
}

// Well-known folders that carry a normalized label (Archive maps to no label, so
// its id is not needed; Drafts is local-only per A5 but still labelled if seen).
const WELL_KNOWN_LABEL_FOLDERS = ['inbox', 'sentitems', 'drafts', 'deleteditems', 'junkemail'];

// Per-uid cache of parentFolderId → well-known label. Lets detail fetches,
// cross-folder result sets, and nextLink continuations resolve INBOX/SENT/...
// from a message's own parentFolderId rather than a single per-query folderLabel
// (the fix for label loss on page-2 and on detail re-saves — review #2/#6/#7).
const folderLabelMapCache = new Map<string, Map<string, string>>();
// In-flight de-dup so concurrent first reads (e.g. getThreads + getMessage) share
// one folder-resolution $batch instead of each firing their own.
const folderLabelMapInflight = new Map<string, Promise<Map<string, string>>>();

function fetchFolderLabelMap(uid: string): Promise<Map<string, string>> {
  const requests = WELL_KNOWN_LABEL_FOLDERS.map((name, i) => ({
    id: String(i),
    method: 'GET',
    url: `/me/mailFolders/${name}?$select=id`
  }));
  return graphBatch(uid, requests).then((result) => {
    if (!result.ok) return new Map<string, string>();
    const { map, complete } = buildFolderLabelMap(result.responses, WELL_KNOWN_LABEL_FOLDERS);
    // Cache ONLY a complete map: a transient per-folder failure must not bake a
    // permanently-incomplete map that silently strips a folder's label for the
    // whole session. An absent (404) folder is fine and still cacheable. While
    // uncached, the resolver yields null and getThreads falls back to its
    // per-query folderLabel (degraded, not broken).
    if (complete) folderLabelMapCache.set(uid, map);
    return map;
  });
}

async function getFolderLabelMap(uid: string): Promise<Map<string, string>> {
  const cached = folderLabelMapCache.get(uid);
  if (cached) return cached;
  const inflight = folderLabelMapInflight.get(uid);
  if (inflight) return inflight;

  const promise = fetchFolderLabelMap(uid).finally(() => folderLabelMapInflight.delete(uid));
  folderLabelMapInflight.set(uid, promise);
  return promise;
}

async function folderLabelResolver(
  uid: string
): Promise<(parentFolderId: string | undefined) => string | null> {
  const map = await getFolderLabelMap(uid);
  return (pid) => (pid ? (map.get(pid) ?? null) : null);
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
    // Recover the folder's well-known label from the continuation URL so page-2+
    // Inbox threads keep INBOX (not just folder:<id>) and don't vanish.
    folderLabel = folderLabelFromNextLink(pageToken);
  } else {
    const { folder, filter, translated } = translateQuery(q ?? '');
    if (!translated) {
      log.info(`[microsoftMailProvider] query "${q}" not translated — defaulting to Inbox (A13).`);
    }
    folderLabel = wellKnownFolderToLabel(folder);
    const params = new URLSearchParams({
      $select: LIST_SELECT,
      $top: maxResults || '25'
    });
    // Graph rejects $orderby unless the sort property also appears in $filter
    // (InefficientFilter). When a filter is present (is:unread / is:starred) we
    // omit $orderby and rely on the client-side sort below.
    if (filter) params.set('$filter', filter);
    else params.set('$orderby', 'receivedDateTime desc');
    path = `/me/mailFolders/${folder}/messages?${params.toString()}`;
  }

  const [resp, resolveFolderLabel] = await Promise.all([
    graphApiClient.get<GraphListResponse>(path, { uid, signal }),
    folderLabelResolver(uid)
  ]);
  const threads = groupByConversation(resp.value ?? [])
    .map((messages) => transformGraphThread(messages, uid, { folderLabel, resolveFolderLabel }))
    .sort((a, b) => b.timestamp - a.timestamp);

  return { threads, nextPageToken: resp['@odata.nextLink'] };
};

interface GraphAttachmentsResponse {
  value?: Array<{ id?: string; contentId?: string | null; isInline?: boolean }>;
}

/**
 * Recover `contentId` for a message's inline attachments so `<img src="cid:…">`
 * in the body can be mapped to images. The detail fetch can't `$select`
 * `contentId` (a fileAttachment-only property on the polymorphic attachments
 * collection → Graph 400s the whole message), so it comes back without it.
 * Fetch the message's inline attachments separately (filtered, so non-inline
 * attachments' bytes aren't pulled) — those full objects carry `contentId` —
 * and merge it into the attachment metadata so the existing inlineImages mapping
 * builds. Best-effort: any failure leaves the body intact, just without inline
 * images.
 */
async function enrichInlineContentIds(
  uid: string,
  message: GraphMessage,
  signal?: AbortSignal
): Promise<GraphMessage> {
  const hasInline = (message.attachments ?? []).some((att) => att.isInline && att.id);
  if (!hasInline) return message;
  try {
    const resp = await graphApiClient.get<GraphAttachmentsResponse>(
      `/me/messages/${encodeURIComponent(message.id)}/attachments?${new URLSearchParams({
        $filter: 'isInline eq true'
      }).toString()}`,
      { uid, signal }
    );
    const contentIdById = new Map<string, string>();
    for (const att of resp.value ?? []) {
      if (att?.id && att.contentId) contentIdById.set(att.id, att.contentId);
    }
    if (contentIdById.size === 0) return message;
    return {
      ...message,
      attachments: (message.attachments ?? []).map((att) =>
        att.id && contentIdById.has(att.id) ? { ...att, contentId: contentIdById.get(att.id) } : att
      )
    };
  } catch {
    return message;
  }
}

const getThread: MailProviderAdapter['getThread'] = async (uid, id, signal) => {
  // No Graph "thread" resource — a thread is a conversation. Fetch its messages
  // and let transformGraphThread sort + assemble them (no $orderby: combining it
  // with the conversationId filter trips Graph's "too complex" sort guard).
  const params = new URLSearchParams({
    $filter: `conversationId eq '${id.replace(/'/g, "''")}'`,
    $select: DETAIL_SELECT,
    $expand: ATTACHMENT_EXPAND,
    $top: GRAPH_MAX_TOP
  });
  // Page through ALL messages — a conversation with >10 messages would otherwise
  // render truncated (wrong recipients/attachments/labels and bad reply context).
  const messages = await fetchAllMessages(uid, `/me/messages?${params.toString()}`, signal);
  // An empty conversation (deleted/expired) is a "not found" — surface it like
  // Gmail's 404 rather than fabricating a blank, empty-id thread that could
  // pollute the cache.
  if (messages.length === 0) {
    throw new Error(`Microsoft conversation not found: ${id}`);
  }
  // Resolve each message's well-known label from its parentFolderId so a detail
  // fetch never strips INBOX/SENT from the cached thread.
  const resolveFolderLabel = await folderLabelResolver(uid);
  // Recover inline-image contentIds (best-effort, per message in parallel).
  const enriched = await Promise.all(messages.map((m) => enrichInlineContentIds(uid, m, signal)));
  return transformGraphThread(enriched, uid, { resolveFolderLabel });
};

const getMessage: MailProviderAdapter['getMessage'] = async (uid, id, signal) => {
  const params = new URLSearchParams({ $select: DETAIL_SELECT, $expand: ATTACHMENT_EXPAND });
  const [raw, resolveFolderLabel] = await Promise.all([
    graphApiClient.get<GraphMessage>(`/me/messages/${encodeURIComponent(id)}?${params.toString()}`, {
      uid,
      signal
    }),
    folderLabelResolver(uid)
  ]);
  const enriched = await enrichInlineContentIds(uid, raw, signal);
  return transformGraphMessage(enriched, { resolveFolderLabel });
};

// ── Delta sync (Phase 10) ────────────────────────────────────────────────────

// Folders tracked by the delta poller (Phase 11). Drafts is excluded — Microsoft
// compose drafts are local-only (A5). Archive is included for completeness.
export const MICROSOFT_TRACKED_FOLDERS = [
  'inbox',
  'sentitems',
  'deleteditems',
  'junkemail',
  'archive'
] as const;

export type MicrosoftDeltaStatus = 'ok' | 'reset' | 'retry' | 'expired' | 'error';

export interface MicrosoftFolderDelta {
  status: MicrosoftDeltaStatus;
  upserts: GraphMessage[];
  removedIds: string[];
  // Save ONLY when status === 'ok'. On reset the caller clears stored state; on
  // retry/expired/error it keeps the prior deltaLink (the cursor is not lost).
  deltaLink: string | null;
}

interface GraphDeltaPage {
  value?: GraphDeltaItem[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

/**
 * One delta sync of a folder. Pass the stored deltaLink to resume; omit it for an
 * initial full delta. Pages through @odata.nextLink, returns upserts + removed
 * ids + the new @odata.deltaLink. Error recovery follows the plan: 410 → reset
 * (full resync), 429 → retry (Retry-After is handled by the poller's backoff),
 * 5xx/network → keep state, auth → expired. The immutable-id Prefer header is
 * carried on the delta + every nextLink/deltaLink automatically by the IPC
 * handler (A1), so ids stay stable across the cursor's lifetime.
 *
 * Caller contract: on a non-'ok' status, `upserts`/`removedIds` hold whatever
 * pages were read before the failure — treat them as provisional and do NOT
 * advance the cursor (the returned deltaLink is the prior one, unchanged).
 */
export async function getMicrosoftFolderDelta(
  uid: string,
  folder: string,
  deltaLink?: string,
  signal?: AbortSignal
): Promise<MicrosoftFolderDelta> {
  const upserts: GraphMessage[] = [];
  const removedIds: string[] = [];
  // Graph encodes $select into the returned nextLink/deltaLink, so it is only
  // set on the initial request; resumes use the opaque link verbatim.
  let path: string | undefined =
    deltaLink && GRAPH_NEXTLINK.test(deltaLink)
      ? deltaLink
      : `/me/mailFolders/${folder}/messages/delta?${new URLSearchParams({ $select: LIST_SELECT }).toString()}`;
  let newDeltaLink: string | null = null;

  try {
    for (let page = 0; path && page < MAX_PAGES; page++) {
      const result = await graphApiClient.get<GraphDeltaPage>(path, { uid, signal });
      const { upserts: pageUpserts, removedIds: pageRemoved } = splitDeltaPage(result.value);
      upserts.push(...pageUpserts);
      removedIds.push(...pageRemoved);
      if (result['@odata.deltaLink']) {
        newDeltaLink = result['@odata.deltaLink'];
        break;
      }
      path = result['@odata.nextLink'];
    }
    // Keep the prior cursor if (defensively) no new deltaLink came back, so a
    // successful sync never clears a valid cursor.
    return { status: 'ok', upserts, removedIds, deltaLink: newDeltaLink ?? deltaLink ?? null };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const code = (err as { data?: { error?: { code?: string } } })?.data?.error?.code;
    const outcome = classifyGraphDeltaError(status, code);
    // reset = the cursor is dead (410 / syncStateNotFound / resyncRequired) → drop
    // it for a full resync; retry/expired/error keep the prior cursor.
    if (outcome === 'reset') return { status: 'reset', upserts: [], removedIds: [], deltaLink: null };
    return { status: outcome, upserts, removedIds, deltaLink: deltaLink ?? null };
  }
}

interface GraphAttachmentContent {
  '@odata.type'?: string;
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string | null;
  contentBytes?: string; // standard base64 — fileAttachment only
}

const FILE_ATTACHMENT_TYPE = '#microsoft.graph.fileAttachment';

function fetchAttachment(uid: string, messageId: string, id: string, signal?: AbortSignal) {
  return graphApiClient.get<GraphAttachmentContent>(
    `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(id)}`,
    { uid, signal }
  );
}

const getAttachmentInline: MailProviderAdapter['getAttachmentInline'] = async (
  uid,
  messageId,
  id,
  signal
) => {
  const att = await fetchAttachment(uid, messageId, id, signal);
  // contentBytes is already standard base64 (no base64url conversion), and the
  // real contentType comes back from the endpoint (no Gmail mimeType:'' hack).
  return {
    attachmentId: att.id ?? id,
    size: att.size ?? 0,
    data: att.contentBytes ?? '',
    mimeType: att.contentType ?? ''
  };
};

const getAttachmentDownload: MailProviderAdapter['getAttachmentDownload'] = async (
  uid,
  messageId,
  id,
  _fileName,
  signal
) => {
  const att = await fetchAttachment(uid, messageId, id, signal);
  // referenceAttachment / itemAttachment carry no inline bytes — surface the
  // limitation instead of handing back an empty file (plan Phase 7).
  if ((att['@odata.type'] ?? '') !== FILE_ATTACHMENT_TYPE || typeof att.contentBytes !== 'string') {
    throw new Error('Unsupported attachment type — this Microsoft attachment cannot be downloaded.');
  }
  const binary = atob(att.contentBytes);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Set the Blob MIME type so preview sniffing works (Gmail's download has none).
  return new Blob([bytes], att.contentType ? { type: att.contentType } : undefined);
};

// ── Mutations (Phase 9) ─────────────────────────────────────────────────────

const JSON_HEADER = { 'Content-Type': 'application/json' };

type GraphBatchOp = {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
};

function assertBatchOk(result: Awaited<ReturnType<typeof graphBatch>>, action: string): void {
  if (!result.ok) throw new Error(`Graph ${action} failed: ${result.error}`);
  const failed = result.responses.find((r) => r.status >= 400);
  if (failed) throw new Error(`Graph ${action} failed (status ${failed.status})`);
}

async function getConversationMessageIds(
  uid: string,
  conversationId: string,
  signal?: AbortSignal
): Promise<string[]> {
  const params = new URLSearchParams({
    $filter: `conversationId eq '${conversationId.replace(/'/g, "''")}'`,
    $select: 'id',
    $top: GRAPH_MAX_TOP
  });
  // Must collect EVERY id — an unpaged fetch (Graph default page = 10) would make
  // mutations/trash silently affect only the first 10 messages of the thread.
  const messages = await fetchAllMessages(uid, `/me/messages?${params.toString()}`, signal);
  return messages.map((m) => m.id).filter(Boolean);
}

async function applyMutation(
  uid: string,
  messageIds: string[],
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  const { patch, moveTo } = planMutation(addLabelIds, removeLabelIds);
  if ((!patch && !moveTo) || messageIds.length === 0) return;

  const requests: GraphBatchOp[] = [];
  let n = 0;
  for (const mid of messageIds) {
    const enc = encodeURIComponent(mid);
    if (patch) {
      requests.push({ id: String(n++), method: 'PATCH', url: `/me/messages/${enc}`, headers: JSON_HEADER, body: patch });
    }
    if (moveTo) {
      // A move returns the message under the SAME immutable id (A1).
      requests.push({
        id: String(n++),
        method: 'POST',
        url: `/me/messages/${enc}/move`,
        headers: JSON_HEADER,
        body: { destinationId: moveTo }
      });
    }
  }
  assertBatchOk(await graphBatch(uid, requests), 'mutation');
}

async function moveMessages(uid: string, messageIds: string[], destinationId: string): Promise<void> {
  if (messageIds.length === 0) return;
  const requests: GraphBatchOp[] = messageIds.map((mid, i) => ({
    id: String(i),
    method: 'POST',
    url: `/me/messages/${encodeURIComponent(mid)}/move`,
    headers: JSON_HEADER,
    body: { destinationId }
  }));
  assertBatchOk(await graphBatch(uid, requests), 'move');
}

const modifyThread: MailProviderAdapter['modifyThread'] = async (
  uid,
  id,
  addLabelIds,
  removeLabelIds,
  signal
) => {
  // Thread-level read/flag/move applies per cached message of the conversation,
  // batched via $batch (A9).
  const ids = await getConversationMessageIds(uid, id, signal);
  await applyMutation(uid, ids, addLabelIds, removeLabelIds);
};

const batchModifyThreads: MailProviderAdapter['batchModifyThreads'] = async (
  uid,
  ids,
  addLabelIds,
  removeLabelIds,
  signal
) => {
  const messageIds = (
    await Promise.all(ids.map((cid) => getConversationMessageIds(uid, cid, signal)))
  ).flat();
  await applyMutation(uid, messageIds, addLabelIds, removeLabelIds);
};

const trashThread: MailProviderAdapter['trashThread'] = async (uid, id, signal) => {
  await moveMessages(uid, await getConversationMessageIds(uid, id, signal), 'deleteditems');
};

const untrashThread: MailProviderAdapter['untrashThread'] = async (uid, id, signal) => {
  await moveMessages(uid, await getConversationMessageIds(uid, id, signal), 'inbox');
};

const modifyMessage: MailProviderAdapter['modifyMessage'] = async (
  uid,
  id,
  addLabelIds,
  removeLabelIds
) => {
  await applyMutation(uid, [id], addLabelIds, removeLabelIds);
  return { addLabelIds, removeLabelIds };
};

// ── Send (Phase 8) ───────────────────────────────────────────────────────────

// Conservative v1 ceiling on the encoded MIME (A4). The real sendMail MIME limit
// is undocumented; large attachments (>3 MB) need the draft + upload-session path
// (v1.5). Verify empirically against a sandbox tenant before raising this.
const MAX_ENCODED_MIME = 4 * 1024 * 1024;

const sendMessage: MailProviderAdapter['sendMessage'] = async (uid, raw, threadId, signal) => {
  const mimeBase64 = base64UrlToBase64(raw);
  if (mimeBase64.length > MAX_ENCODED_MIME) {
    throw new Error(
      'This message is too large to send from a Microsoft account in this version — attachments over ~3 MB are not yet supported.'
    );
  }

  // MIME mode: POST the base64 MIME as text/plain. Reply threading rides on the
  // In-Reply-To/References headers buildRawMessage already wrote, so threadId is
  // not needed. Graph files the message in Sent Items itself.
  await graphApiClient.post<unknown>('/me/sendMail', mimeBase64, {
    uid,
    signal,
    headers: { 'Content-Type': 'text/plain' }
  });

  // sendMail returns 202 with no body — there is no message id to surface. The
  // sent message arrives via Sent Items sync; the caller tolerates an empty id.
  return { id: '', threadId: threadId ?? '' };
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
  getMessage,
  getAttachmentInline,
  getAttachmentDownload,
  modifyThread,
  batchModifyThreads,
  trashThread,
  untrashThread,
  modifyMessage,
  sendMessage
};
