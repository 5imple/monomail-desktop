import log from 'electron-log';
import { graphApiClient, graphBatch } from '@/main/api/apiClient';
import {
  buildFolderLabelMap,
  GraphDeltaItem,
  GraphMessage,
  splitDeltaPage,
  transformGraphMessage,
  transformGraphThread,
  wellKnownFolderToLabel,
  isGraphEventMessage
} from '@/main/api/mail/graphTransforms';
import {
  googleMailProvider,
  MailProviderAdapter
} from '@/main/api/mail/providers/googleMailProvider';
import {
  base64UrlToBase64,
  classifyGraphDeltaError,
  FolderedMessage,
  MOVE_FOLDERS,
  MoveFolderIds,
  planMutation,
  selectMessagesToMove,
  translateQuery,
  buildGraphSearch,
  graphSearchParam
} from '@/main/api/mail/graphRequestMapping';

// Defensive cap on pagination loops so a malformed/looping server nextLink can
// never spin forever (Graph pages are ~10–1000 items; real result sets are far
// under this).
const MAX_PAGES = 100;

// Fields the list view needs (no body — kept lightweight, like Gmail's
// format=metadata list). `from`/`sender` cover delegated/shared mailboxes.
const LIST_SELECT =
  'id,conversationId,internetMessageId,parentFolderId,subject,bodyPreview,from,sender,' +
  'toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,flag,hasAttachments,categories,' +
  // Focused Inbox: 'focused' or 'other' (the "Others" label filters on it).
  'inferenceClassification';

// Detail view adds the body, bcc, and headers. internetMessageHeaders is kept
// for reply threading; uniqueBody is fetched for the eventual reply-fragment path.
const DETAIL_SELECT = `${LIST_SELECT},body,bccRecipients,internetMessageHeaders`;
// First pass of a progressive thread load: everything but the (often huge)
// bodies and headers.
const PARTIAL_SELECT = `${LIST_SELECT},bccRecipients`;
// `contentId` is a `fileAttachment`-only property: selecting it bare on the
// polymorphic `attachments` collection makes Graph 400 the whole message GET
// ("Could not find a property named 'contentId' on type
// 'microsoft.graph.attachment'"), which blanks the message body. The OData
// type-cast form `microsoft.graph.fileAttachment/contentId` is accepted and
// returns contentId WITHOUT contentBytes — so inline cid→image mapping comes
// back with the detail fetch itself, no extra round trip.
const ATTACHMENT_EXPAND =
  'attachments($select=id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId)';
// Same type-cast, for the per-message fallback lookup below.
const INLINE_CONTENT_ID_SELECT = 'id,microsoft.graph.fileAttachment/contentId';

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

// Inline-image bytes for a given (uid, messageId, attachmentId) are immutable,
// but the reader re-fetches them on every render / re-open / scroll-back /
// dark-mode toggle — each a full base64 download from Graph over IPC, which is
// why embedded pictures felt slow to load. Cache the fetched bytes in a bounded
// in-memory LRU so only the first view of an image pays the network; repeat
// views resolve instantly.
type InlineAttachmentResult = {
  attachmentId: string;
  size: number;
  data: string;
  mimeType: string;
};
const INLINE_ATTACHMENT_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const inlineAttachmentCache = new Map<string, InlineAttachmentResult>();
let inlineAttachmentCacheBytes = 0;

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
  // Words or search operators: a Graph search, not a folder listing.
  const searchPlan = q ? buildGraphSearch(q) : null;

  // An opaque @odata.nextLink continuation routes straight back through the
  // same Graph helper (origin-validated main-side). The folder is unknown on a
  // continuation, but each message still carries its folder:<id> label.
  if (pageToken && GRAPH_NEXTLINK.test(pageToken)) {
    path = pageToken;
    // Recover the folder's well-known label from the continuation URL so page-2+
    // Inbox threads keep INBOX (not just folder:<id>) and don't vanish.
    folderLabel = folderLabelFromNextLink(pageToken);
  } else if (searchPlan) {
    // A search: Graph $search (KQL) over the named folder, or the whole
    // mailbox. $search takes neither $orderby (results come newest first) nor
    // $filter (read / flag conditions are applied below).
    folderLabel = searchPlan.folder ? wellKnownFolderToLabel(searchPlan.folder) : null;
    const params = new URLSearchParams({
      $search: graphSearchParam(searchPlan.kql),
      $select: LIST_SELECT,
      $top: maxResults || '25'
    });
    path = searchPlan.folder
      ? `/me/mailFolders/${searchPlan.folder}/messages?${params.toString()}`
      : `/me/messages?${params.toString()}`;
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
  const messages = (resp.value ?? []).filter(
    (message) =>
      (!searchPlan?.unreadOnly || message.isRead === false) &&
      (!searchPlan?.flaggedOnly || message.flag?.flagStatus === 'flagged')
  );
  const threads = groupByConversation(messages)
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
  // ATTACHMENT_EXPAND normally returns contentId already; only fall back to a
  // separate lookup for inline attachments that still lack one.
  const missingContentId = (message.attachments ?? []).some(
    (att) => att.isInline && att.id && !att.contentId
  );
  if (!missingContentId) return message;
  try {
    // $select keeps this metadata-only. The unselected form returned every
    // inline image's full contentBytes (~330 KB for a 5-image message) on the
    // critical path of opening an email — then the reader downloaded each
    // image again to display it.
    const resp = await graphApiClient.get<GraphAttachmentsResponse>(
      `/me/messages/${encodeURIComponent(message.id)}/attachments?${new URLSearchParams({
        $filter: 'isInline eq true',
        $select: INLINE_CONTENT_ID_SELECT
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

// The calendar event a meeting message points at: what the reader shows and
// the id it RSVPs with, without the event's body.
const MEETING_EVENT_SELECT =
  'id,subject,start,end,isAllDay,isCancelled,location,organizer,attendees,responseStatus,onlineMeeting,webLink';

/**
 * Meeting details for an invitation, a cancellation or an attendee's reply.
 * Graph delivers these as `eventMessage` items (`@odata.type`), whose body is
 * usually empty: the meeting lives in fields of the derived type
 * (meetingMessageType, start/end, the reply's responseType) and in the
 * calendar event it points at. A `$select` on the polymorphic /me/messages
 * listing can't name those, so each meeting message costs one more GET, with
 * the event expanded through the type cast Graph documents for it. Tried most
 * to least specific; best-effort — on failure the message stays plain mail.
 */
async function fetchMeetingFields(
  uid: string,
  message: GraphMessage,
  signal?: AbortSignal
): Promise<GraphMessage> {
  if (!isGraphEventMessage(message)) return message;
  const path = `/me/messages/${encodeURIComponent(message.id)}`;
  const attempts = [
    `${path}?${new URLSearchParams({
      $expand: `microsoft.graph.eventMessage/event($select=${MEETING_EVENT_SELECT})`
    }).toString()}`,
    `${path}?${new URLSearchParams({ $expand: 'microsoft.graph.eventMessage/event' }).toString()}`,
    // Without the event there is no RSVP, but the meeting still shows.
    path
  ];
  for (const url of attempts) {
    try {
      const detail = await graphApiClient.get<GraphMessage>(url, { uid, signal });
      return {
        ...message,
        '@odata.type': detail['@odata.type'] ?? message['@odata.type'],
        meetingMessageType: detail.meetingMessageType,
        startDateTime: detail.startDateTime,
        endDateTime: detail.endDateTime,
        location: detail.location,
        isAllDay: detail.isAllDay,
        isOutOfDate: detail.isOutOfDate,
        responseType: detail.responseType,
        proposedNewTime: detail.proposedNewTime,
        event: detail.event ?? null
      };
    } catch {
      if (signal?.aborted) break;
    }
  }
  return message;
}

/** Everything a message needs beyond the listing: inline image ids, meeting details. */
const completeMessage = async (
  uid: string,
  message: GraphMessage,
  signal?: AbortSignal
): Promise<GraphMessage> =>
  fetchMeetingFields(uid, await enrichInlineContentIds(uid, message, signal), signal);

// Conversations at least this long get a newest-message-first partial result.
const PROGRESSIVE_MIN_MESSAGES = 3;

const EVENT_RESPONSE_TYPE = /eventMessageResponse$/i;

/**
 * The message a progressive load fetches first: the newest one the reader
 * will open on. Not an attendee's empty meeting reply ("Accepted: Standup",
 * an eventMessageResponse with no preview text), which is often the newest in
 * an Outlook conversation and has nothing to show; the newest message that
 * may have a body instead, or the newest of all when none does.
 */
function newestWithBody(messages: GraphMessage[]): GraphMessage {
  const time = (message: GraphMessage) => Date.parse(message.receivedDateTime ?? '') || 0;
  const byNewest = [...messages].sort((a, b) => time(b) - time(a));
  return (
    byNewest.find(
      (message) =>
        !EVENT_RESPONSE_TYPE.test(message['@odata.type'] ?? '') || !!message.bodyPreview?.trim()
    ) ?? byNewest[0]
  );
}

// Timing lines in the dev log for opening a conversation. Optional chaining:
// the unit tests bundle this file with esbuild, where import.meta.env is unset.
const DEV_TIMING = Boolean(import.meta.env?.DEV);

const getThread: MailProviderAdapter['getThread'] = async (uid, id, signal, onPartial) => {
  const conversationFilter = `conversationId eq '${id.replace(/'/g, "''")}'`;

  // The complete thread. Started immediately and never delayed by the partial
  // pass below.
  let fullSettled = false;
  const fullThread = (async () => {
    // No Graph "thread" resource — a thread is a conversation. Fetch its
    // messages and let transformGraphThread sort + assemble them (no $orderby:
    // combining it with the conversationId filter trips Graph's "too complex"
    // sort guard).
    const params = new URLSearchParams({
      $filter: conversationFilter,
      $select: DETAIL_SELECT,
      $expand: ATTACHMENT_EXPAND,
      $top: GRAPH_MAX_TOP
    });
    // Page through ALL messages — a conversation with >10 messages would
    // otherwise render truncated (wrong recipients/attachments/labels and bad
    // reply context).
    const startedAt = performance.now();
    const messages = await fetchAllMessages(uid, `/me/messages?${params.toString()}`, signal);
    // An empty conversation (deleted/expired) is a "not found" — surface it
    // like Gmail's 404 rather than fabricating a blank, empty-id thread that
    // could pollute the cache.
    if (messages.length === 0) {
      throw new Error(`Microsoft conversation not found: ${id}`);
    }
    // Resolve each message's well-known label from its parentFolderId so a
    // detail fetch never strips INBOX/SENT from the cached thread.
    const resolveFolderLabel = await folderLabelResolver(uid);
    const listedAt = performance.now();
    // Recover any inline-image contentIds the $expand didn't return.
    const enriched = await Promise.all(messages.map((m) => completeMessage(uid, m, signal)));
    if (DEV_TIMING) {
      // Dev only: the two network phases of opening a conversation.
      log.debug(
        `[graph] thread of ${messages.length}: listed in ${Math.round(listedAt - startedAt)} ms, inline ids and meetings in ${Math.round(performance.now() - listedAt)} ms`
      );
    }
    return transformGraphThread(enriched, uid, { resolveFolderLabel });
  })().finally(() => {
    fullSettled = true;
  });

  // Partial pass, in parallel. Long conversations quote their whole history in
  // every reply (one real 36-message thread was 4.2 MB, ~2 s), so fetch the
  // messages without bodies plus only the newest in full — the one message the
  // reader expands — and hand that over first if the full fetch is still out.
  // Two round trips: one light listing (no bodies, no attachment expansion:
  // expanding attachments is what makes a conversation listing slow, ~600 ms
  // for 36 messages / 152 inline images), then the chosen message's detail.
  // An ids-only listing before it cost a third, so the partial usually lost
  // the race to the full fetch and was dropped. Best-effort: any failure just
  // leaves the full fetch to land on its own.
  const partialDelivered = onPartial
    ? (async () => {
        const startedAt = performance.now();
        try {
          const lightParams = new URLSearchParams({
            $filter: conversationFilter,
            $select: PARTIAL_SELECT,
            $top: GRAPH_MAX_TOP
          });
          const [light, resolveFolderLabel] = await Promise.all([
            fetchAllMessages(uid, `/me/messages?${lightParams.toString()}`, signal),
            folderLabelResolver(uid)
          ]);
          if (fullSettled || light.length < PROGRESSIVE_MIN_MESSAGES) return;
          const newest = newestWithBody(light);
          const detailParams = new URLSearchParams({
            $select: DETAIL_SELECT,
            $expand: ATTACHMENT_EXPAND
          });
          const rawNewest = await graphApiClient.get<GraphMessage>(
            `/me/messages/${encodeURIComponent(newest.id)}?${detailParams.toString()}`,
            { uid, signal }
          );
          if (fullSettled) return;
          const fullNewest = await completeMessage(uid, rawNewest, signal);
          if (fullSettled) return;
          await onPartial(
            transformGraphThread(
              light.map((m) => (m.id === newest.id ? fullNewest : m)),
              uid,
              { resolveFolderLabel }
            )
          );
          if (DEV_TIMING) {
            log.debug(
              `[graph] thread of ${light.length}: newest message shown after ${Math.round(performance.now() - startedAt)} ms`
            );
          }
        } catch {
          // Best-effort (see above).
        }
      })()
    : undefined;

  const result = await fullThread;
  // A partial already being applied must finish first, so the caller's update
  // with the full thread always lands last.
  await partialDelivered;
  return result;
};

const getMessage: MailProviderAdapter['getMessage'] = async (uid, id, signal) => {
  const params = new URLSearchParams({ $select: DETAIL_SELECT, $expand: ATTACHMENT_EXPAND });
  const [raw, resolveFolderLabel] = await Promise.all([
    graphApiClient.get<GraphMessage>(
      `/me/messages/${encodeURIComponent(id)}?${params.toString()}`,
      {
        uid,
        signal
      }
    ),
    folderLabelResolver(uid)
  ]);
  const enriched = await completeMessage(uid, raw, signal);
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
/** How many of a folder's newest messages listFolderMessageIds reads. */
export const FOLDER_ID_LISTING_SIZE = 250;

/**
 * Ids and received times of a folder's newest messages, newest first, for
 * telling which cached messages have left the folder (lib/listingPrune). Just
 * three small fields, so one request covers far more than a page of the list.
 * `complete`: these are all of the folder's messages.
 */
export async function listFolderMessageIds(
  uid: string,
  folder: string,
  signal?: AbortSignal
): Promise<{ messages: { id: string; timestamp: number }[]; complete: boolean }> {
  const params = new URLSearchParams({
    $select: 'id,receivedDateTime',
    $orderby: 'receivedDateTime desc',
    $top: String(FOLDER_ID_LISTING_SIZE)
  });
  const resp = await graphApiClient.get<GraphListResponse>(
    `/me/mailFolders/${folder}/messages?${params.toString()}`,
    { uid, signal }
  );
  const messages = (resp.value ?? []).flatMap((message) => {
    const timestamp = Date.parse(message.receivedDateTime ?? '');
    return message.id && Number.isFinite(timestamp) ? [{ id: message.id, timestamp }] : [];
  });
  return { messages, complete: !resp['@odata.nextLink'] };
}

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
    if (outcome === 'reset')
      return { status: 'reset', upserts: [], removedIds: [], deltaLink: null };
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
  const cacheKey = `${uid} ${messageId} ${id}`;
  const cached = inlineAttachmentCache.get(cacheKey);
  if (cached) {
    // Refresh LRU recency.
    inlineAttachmentCache.delete(cacheKey);
    inlineAttachmentCache.set(cacheKey, cached);
    return cached;
  }

  const att = await fetchAttachment(uid, messageId, id, signal);
  // contentBytes is already standard base64 (no base64url conversion), and the
  // real contentType comes back from the endpoint (no Gmail mimeType:'' hack).
  const result: InlineAttachmentResult = {
    attachmentId: att.id ?? id,
    size: att.size ?? 0,
    data: att.contentBytes ?? '',
    mimeType: att.contentType ?? ''
  };

  // Cache the immutable bytes; evict least-recently-used entries until back
  // under the byte budget.
  const bytes = result.data.length;
  if (bytes > 0 && bytes <= INLINE_ATTACHMENT_CACHE_MAX_BYTES) {
    inlineAttachmentCache.set(cacheKey, result);
    inlineAttachmentCacheBytes += bytes;
    while (
      inlineAttachmentCacheBytes > INLINE_ATTACHMENT_CACHE_MAX_BYTES &&
      inlineAttachmentCache.size > 1
    ) {
      const oldestKey = inlineAttachmentCache.keys().next().value as string;
      inlineAttachmentCacheBytes -= inlineAttachmentCache.get(oldestKey)?.data.length ?? 0;
      inlineAttachmentCache.delete(oldestKey);
    }
  }

  return result;
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
    throw new Error(
      'Unsupported attachment type — this Microsoft attachment cannot be downloaded.'
    );
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
  if (failed) {
    const graphError = (failed.body as { error?: { code?: string; message?: string } } | null)
      ?.error;
    const detail = [graphError?.code, graphError?.message].filter(Boolean).join(': ');
    throw new Error(
      `Graph ${action} failed (status ${failed.status}${detail ? ` — ${detail}` : ''})`
    );
  }
}

async function getConversationMessages(
  uid: string,
  conversationId: string,
  signal?: AbortSignal
): Promise<FolderedMessage[]> {
  const params = new URLSearchParams({
    $filter: `conversationId eq '${conversationId.replace(/'/g, "''")}'`,
    // The folder decides which messages a move takes (selectMessagesToMove).
    $select: 'id,parentFolderId',
    $top: GRAPH_MAX_TOP
  });
  // Must collect EVERY id — an unpaged fetch (Graph default page = 10) would make
  // mutations/trash silently affect only the first 10 messages of the thread.
  const messages = await fetchAllMessages(uid, `/me/messages?${params.toString()}`, signal);
  return messages.filter((m) => m.id).map((m) => ({ id: m.id, parentFolderId: m.parentFolderId }));
}

// Per-uid ids of the folders selectMessagesToMove decides by. Cached once all
// resolved (a folder the mailbox doesn't have is a 404); any other failure
// throws, so a move never runs on a guess about where the messages are.
const moveFolderIdsCache = new Map<string, MoveFolderIds>();
const moveFolderIdsInflight = new Map<string, Promise<MoveFolderIds>>();

async function fetchMoveFolderIds(uid: string): Promise<MoveFolderIds> {
  const result = await graphBatch(
    uid,
    MOVE_FOLDERS.map((name, i) => ({
      id: String(i),
      method: 'GET',
      url: `/me/mailFolders/${name}?$select=id`
    }))
  );
  if (!result.ok) throw new Error(`Graph folder lookup failed: ${result.error}`);
  const ids: MoveFolderIds = {};
  MOVE_FOLDERS.forEach((name, i) => {
    const response = result.responses.find((r) => r.id === String(i));
    const id = (response?.body as { id?: string } | null | undefined)?.id;
    if (response?.status === 200 && id) ids[name] = id;
    else if (response?.status !== 404) {
      throw new Error(`Graph folder lookup failed for ${name} (status ${response?.status ?? '?'})`);
    }
  });
  moveFolderIdsCache.set(uid, ids);
  return ids;
}

async function getMoveFolderIds(uid: string): Promise<MoveFolderIds> {
  const cached = moveFolderIdsCache.get(uid);
  if (cached) return cached;
  const inflight = moveFolderIdsInflight.get(uid);
  if (inflight) return inflight;
  const promise = fetchMoveFolderIds(uid).finally(() => moveFolderIdsInflight.delete(uid));
  moveFolderIdsInflight.set(uid, promise);
  return promise;
}

/** PATCHes `patchIds` and moves `moveIds` to `moveTo`, in one $batch (A9). */
async function sendMutation(
  uid: string,
  patchIds: string[],
  patch: Record<string, unknown> | undefined,
  moveIds: string[],
  moveTo: string | undefined
): Promise<void> {
  const requests: GraphBatchOp[] = [];
  let n = 0;
  if (patch) {
    for (const id of patchIds) {
      requests.push({
        id: String(n++),
        method: 'PATCH',
        url: `/me/messages/${encodeURIComponent(id)}`,
        headers: JSON_HEADER,
        body: patch
      });
    }
  }
  if (moveTo) {
    for (const id of moveIds) {
      // A move returns the message under the SAME immutable id (A1).
      requests.push({
        id: String(n++),
        method: 'POST',
        url: `/me/messages/${encodeURIComponent(id)}/move`,
        headers: JSON_HEADER,
        body: { destinationId: moveTo }
      });
    }
  }
  // Nothing to change: e.g. Done on a conversation already out of the Inbox.
  if (requests.length === 0) return;
  assertBatchOk(await graphBatch(uid, requests), 'mutation');
}

// The Inbox copies Done last took out of each conversation (by uid and
// conversation), so its undo brings back just those, not messages of the
// conversation that had been archived before.
const doneMovedIds = new Map<string, string[]>();

/**
 * A label change on whole conversations: read/flag on every message, a move on
 * the ones selectMessagesToMove takes (archive / trash / junk / restore /
 * folder), batched via $batch (A9).
 */
async function mutateConversations(
  uid: string,
  conversationIds: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> {
  const { patch, moveTo } = planMutation(addLabelIds, removeLabelIds);
  if (!patch && !moveTo) return;
  const conversations = await Promise.all(
    conversationIds.map((cid) => getConversationMessages(uid, cid, signal))
  );
  const folders = moveTo ? await getMoveFolderIds(uid) : {};
  const keys = conversationIds.map((cid) => `${uid} ${cid}`);
  // Back to the Inbox (not out of Trash / Junk) right after a Done: its moves.
  const undoingDone =
    moveTo === 'inbox' && !removeLabelIds.includes('TRASH') && !removeLabelIds.includes('SPAM');
  const moves = conversations.map((messages, i) => {
    if (!moveTo) return [];
    const ids = selectMessagesToMove(messages, moveTo, addLabelIds, removeLabelIds, folders);
    const done = undoingDone ? doneMovedIds.get(keys[i]) : undefined;
    return done ? ids.filter((id) => done.includes(id)) : ids;
  });

  await sendMutation(
    uid,
    conversations.flat().map((m) => m.id),
    patch,
    moves.flat(),
    moveTo
  );
  if (!moveTo) return;
  keys.forEach((key, i) => {
    if (moveTo !== 'archive') doneMovedIds.delete(key);
    else if (moves[i].length > 0) doneMovedIds.set(key, moves[i]);
  });
}

const modifyThread: MailProviderAdapter['modifyThread'] = async (
  uid,
  id,
  addLabelIds,
  removeLabelIds,
  signal
) => {
  await mutateConversations(uid, [id], addLabelIds, removeLabelIds, signal);
};

const batchModifyThreads: MailProviderAdapter['batchModifyThreads'] = async (
  uid,
  ids,
  addLabelIds,
  removeLabelIds,
  signal
) => {
  await mutateConversations(uid, ids, addLabelIds, removeLabelIds, signal);
};

// Trash / restore are the label change they are (add / remove TRASH): restore
// brings back the Deleted Items copies only, and neither re-moves a message
// already there (selectMessagesToMove).
const trashThread: MailProviderAdapter['trashThread'] = async (uid, id, signal) => {
  await mutateConversations(uid, [id], ['TRASH'], [], signal);
};

const untrashThread: MailProviderAdapter['untrashThread'] = async (uid, id, signal) => {
  await mutateConversations(uid, [id], [], ['TRASH'], signal);
};

const modifyMessage: MailProviderAdapter['modifyMessage'] = async (
  uid,
  id,
  addLabelIds,
  removeLabelIds
) => {
  const { patch, moveTo } = planMutation(addLabelIds, removeLabelIds);
  // A move depends on the folder the message is in (selectMessagesToMove).
  const moveIds = moveTo
    ? selectMessagesToMove(
        [
          await graphApiClient.get<FolderedMessage>(
            `/me/messages/${encodeURIComponent(id)}?$select=id,parentFolderId`,
            { uid }
          )
        ],
        moveTo,
        addLabelIds,
        removeLabelIds,
        await getMoveFolderIds(uid)
      )
    : [];
  await sendMutation(uid, [id], patch, moveIds, moveTo);
  return { addLabelIds, removeLabelIds };
};

// The Message-ID and References of a message, for a reply's In-Reply-To /
// References headers (see buildRawMessage): what Microsoft's servers thread the
// sent reply into its conversation by.
const getReplyHeaders: MailProviderAdapter['getReplyHeaders'] = async (uid, id, signal) => {
  const message = await graphApiClient.get<GraphMessage>(
    `/me/messages/${encodeURIComponent(id)}?$select=internetMessageId,internetMessageHeaders`,
    { uid, signal }
  );
  const references = message.internetMessageHeaders?.find(
    (header) => header.name.toLowerCase() === 'references'
  )?.value;
  return { messageId: message.internetMessageId, references };
};

// ── Send (Phase 8) ───────────────────────────────────────────────────────────

// Conservative v1 ceiling on the encoded MIME (A4). The real sendMail MIME limit
// is undocumented; large attachments (>3 MB) need the draft + upload-session path
// (v1.5). Verify empirically against a sandbox tenant before raising this.
const MAX_ENCODED_MIME = 4 * 1024 * 1024;

const sendMessage: MailProviderAdapter['sendMessage'] = async (uid, raw, threadId, signal) => {
  const mimeBase64 = base64UrlToBase64(raw);
  if (mimeBase64.length > MAX_ENCODED_MIME) {
    const error = new Error(
      'This message is too large to send from a Microsoft account in this version — attachments over ~3 MB are not yet supported.'
    );
    // Recognised by the send toast, which shows a specific message for it.
    error.name = 'MessageTooLargeError';
    throw error;
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
  getReplyHeaders,
  sendMessage
};
