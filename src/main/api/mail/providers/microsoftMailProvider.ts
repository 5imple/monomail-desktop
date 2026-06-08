import log from 'electron-log';
import { graphApiClient, graphBatch } from '@/main/api/apiClient';
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

/**
 * Translates a Mono label mutation into Graph operations: read/flag become a
 * PATCH on the message; archive/trash/junk/restore/custom-folder become a move.
 * Archive resolves to the `archive` well-known name only — never a localized
 * display name (A11). Moves preserve the immutable id (A1), so the cache keeps
 * message identity across them.
 */
function planMutation(
  addLabelIds: string[],
  removeLabelIds: string[]
): { patch?: Record<string, unknown>; moveTo?: string } {
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
    $select: 'id'
  });
  const resp = await graphApiClient.get<GraphListResponse>(`/me/messages?${params.toString()}`, {
    uid,
    signal
  });
  return (resp.value ?? []).map((m) => m.id).filter(Boolean);
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

// buildRawMessage emits the envelope as base64url with padding stripped; Graph's
// MIME sendMail wants standard base64 — restore the +/ alphabet and re-pad.
function base64UrlToBase64(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
}

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
