import { MonoAttachment, MonoRecipient } from '@/main/models/types';
import { IMonoThread } from '@/main/models/thread/MonoThread';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MailMessage, MailMessagePayload } from '@/main/api/mail/types';

// ── Raw Microsoft Graph shapes (the $select fields this app reads) ────────────

interface GraphEmailAddress {
  name?: string;
  address?: string;
}
interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}
interface GraphItemBody {
  contentType?: string; // 'html' | 'text'
  content?: string;
}
export interface GraphAttachmentMeta {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string | null;
}
export interface GraphMessage {
  id: string; // immutable id (primary key — [A1])
  conversationId?: string;
  internetMessageId?: string; // secondary metadata only — [A1]
  parentFolderId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: GraphItemBody;
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  flag?: { flagStatus?: string };
  hasAttachments?: boolean;
  categories?: string[];
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  attachments?: GraphAttachmentMeta[];
}

// A delta-page entry is either a changed/added message or a tombstone carrying
// `@removed` (with the message id).
export type GraphDeltaItem = GraphMessage & { '@removed'?: { reason?: string } };

/**
 * Splits a /messages/delta page's `value` into upserts (new/changed messages)
 * and removed message ids (the `@removed` tombstones). Pure — the fetch loop +
 * cursor handling live in the provider.
 */
export function splitDeltaPage(value: GraphDeltaItem[] | undefined): {
  upserts: GraphMessage[];
  removedIds: string[];
} {
  const upserts: GraphMessage[] = [];
  const removedIds: string[] = [];
  for (const item of value ?? []) {
    if (item && item['@removed']) {
      if (item.id) removedIds.push(item.id);
    } else if (item?.id) {
      upserts.push(item);
    }
  }
  return { upserts, removedIds };
}

// ── Label / folder mapping ────────────────────────────────────────────────────

// Graph well-known folder names → normalized Mono labels. Archive maps to
// neither (Gmail has no Archive label; archived mail simply lacks INBOX).
// Matched on the well-known *name*, never localized display names ([A11]).
const WELL_KNOWN_FOLDER_LABELS: Record<string, string> = {
  inbox: 'INBOX',
  sentitems: 'SENT',
  drafts: 'DRAFT',
  deleteditems: 'TRASH',
  junkemail: 'SPAM'
};

export function wellKnownFolderToLabel(wellKnownName?: string | null): string | null {
  if (!wellKnownName) return null;
  return WELL_KNOWN_FOLDER_LABELS[wellKnownName.toLowerCase()] ?? null;
}

/**
 * Builds normalized labelIds for a Graph message. `folderLabel` is the
 * already-resolved well-known label for the message's folder (the caller knows
 * which folder it queried / resolved `parentFolderId` against); pass null for
 * Archive or custom folders. No `CATEGORY_*` labels are emitted for Microsoft.
 */
export function mapGraphMessageLabels(
  message: GraphMessage,
  folderLabel: string | null
): string[] {
  const labels = new Set<string>();
  if (folderLabel) labels.add(folderLabel);
  if (message.isRead === false) labels.add('UNREAD');
  if (message.flag?.flagStatus === 'flagged') labels.add('STARRED');
  if (message.parentFolderId) labels.add(`folder:${message.parentFolderId}`);
  for (const category of message.categories ?? []) {
    if (category) labels.add(`category:${category}`);
  }
  return Array.from(labels);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toRecipient(recipient?: GraphRecipient): MonoRecipient {
  return {
    name: recipient?.emailAddress?.name ?? '',
    email: recipient?.emailAddress?.address ?? ''
  };
}

function toRecipients(recipients?: GraphRecipient[]): MonoRecipient[] {
  return (recipients ?? []).map(toRecipient).filter((r) => r.email);
}

function normalizeContentId(value?: string | null): string {
  if (!value) return '';
  let normalized = value.trim().replace(/^cid:/i, '').replace(/^<|>$/g, '');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the sender-provided value when it is not valid URI encoding.
  }
  return normalized.trim().replace(/^<|>$/g, '');
}

/**
 * Encodes a UTF-8 string to base64url (no padding) — the exact inverse of the
 * renderer's `decodePayloadData` (utils.ts), so a synthetic payload part round-
 * trips through the existing `parsePayloadPart` pipeline untouched. Chunked to
 * avoid blowing the argument stack on large bodies.
 */
function utf8ToBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bodyPart(mimeType: string, content: string): MailMessagePayload {
  const data = utf8ToBase64Url(content);
  return {
    partId: mimeType === 'text/html' ? '1' : '0',
    mimeType,
    fileName: '',
    body: { attachmentId: null, size: new TextEncoder().encode(content).length, data }
  };
}

/**
 * Microsoft messages have no raw MIME tree, so we wrap the Graph body in a
 * synthetic multipart/alternative payload. `parsePayloadPart` then decodes,
 * sanitizes, extracts quoted history, and resolves `cid:` inline images against
 * the `inlineImages` map — the same path Gmail messages take.
 */
function buildSyntheticPayload(body?: GraphItemBody): MailMessagePayload {
  const isHtml = (body?.contentType ?? '').toLowerCase() === 'html';
  const content = body?.content ?? '';
  return {
    partId: '',
    mimeType: 'multipart/alternative',
    fileName: '',
    body: { attachmentId: null, size: 0, data: null },
    parts: [bodyPart(isHtml ? 'text/html' : 'text/plain', content)]
  };
}

function mapGraphAttachments(attachments?: GraphAttachmentMeta[]): {
  inlineImages: Record<string, MonoAttachment>;
  attachments: Record<string, MonoAttachment>;
  inlineImageSize: number;
} {
  const inlineImages: Record<string, MonoAttachment> = {};
  const fileAttachments: Record<string, MonoAttachment> = {};

  for (const att of attachments ?? []) {
    if (!att?.id) continue;
    const entry: MonoAttachment = {
      attachmentId: att.id,
      fileName: att.name ?? '',
      mimeType: att.contentType ?? '',
      size: att.size ?? 0
    };
    const cid = normalizeContentId(att.contentId);
    // Don't trust hasAttachments for inline-only mail — branch on isInline + cid.
    if (att.isInline && cid) {
      inlineImages[cid] = entry;
    } else if (att.name) {
      fileAttachments[att.name] = entry;
    }
  }

  const inlineImageSize = Object.values(inlineImages).reduce((sum, a) => sum + a.size, 0);
  return { inlineImages, attachments: fileAttachments, inlineImageSize };
}

function parseTimestamp(message: GraphMessage): number {
  const iso = message.receivedDateTime ?? message.sentDateTime ?? '';
  const ms = iso ? Date.parse(iso) : NaN;
  // Fall back to 0 (epoch), NOT the current time: a missing/invalid date must
  // not make a message sort as newest or persist a bogus "now" timestamp.
  return Number.isFinite(ms) ? ms : 0;
}

export interface GraphTransformOptions {
  // The well-known label for the folder the message was read from (INBOX, SENT,
  // …) or null for Archive / custom folders. Applied to every mapped message.
  folderLabel?: string | null;
  // Per-message resolver from parentFolderId → well-known label, backed by the
  // account's well-known-folder-id map. Preferred over folderLabel because it is
  // correct on cross-folder result sets, detail fetches, and nextLink
  // continuations (where a single folderLabel is unknown or wrong).
  resolveFolderLabel?: (parentFolderId: string | undefined) => string | null;
}

// ── Public transforms ─────────────────────────────────────────────────────────

/**
 * Graph message → MailMessage (+ direct bodyHtml/bodyPlain). The primary key is
 * the Graph **immutable** id; `internetMessageId`/`conversationId` are kept by
 * the caller as supplementary metadata only ([A1]).
 */
export function transformGraphMessage(
  message: GraphMessage,
  options: GraphTransformOptions = {}
): MailMessage & { bodyHtml?: string; bodyPlain?: string } {
  const { inlineImages, attachments, inlineImageSize } = mapGraphAttachments(message.attachments);
  const isHtml = (message.body?.contentType ?? '').toLowerCase() === 'html';
  const content = message.body?.content ?? '';
  // Prefer the per-message folder resolution (correct across folders / detail /
  // continuations); fall back to a caller-supplied single folderLabel.
  const folderLabel = options.resolveFolderLabel?.(message.parentFolderId) ?? options.folderLabel ?? null;

  return {
    id: message.id,
    // conversationId is supplementary and known-unreliable across external
    // replies; v1 groups on it but never builds a composite key with it.
    threadId: message.conversationId ?? message.id,
    labelIds: mapGraphMessageLabels(message, folderLabel),
    snippet: message.bodyPreview ?? null,
    historyId: null, // the Microsoft cursor lives in per-folder delta state, not here
    timestamp: parseTimestamp(message),
    timezone: 'UTC', // Graph timestamps are UTC (ISO-8601 'Z')
    subject: message.subject ?? '',
    from: toRecipient(message.from ?? message.sender),
    to: toRecipients(message.toRecipients),
    cc: toRecipients(message.ccRecipients),
    bcc: toRecipients(message.bccRecipients),
    listUnsubscribe: { url: [], mailTo: [] },
    inlineImages,
    attachments,
    inlineImageSize,
    payload: buildSyntheticPayload(message.body),
    bodyHtml: isHtml ? content : undefined,
    bodyPlain: isHtml ? undefined : content
  };
}

/**
 * Groups a set of Graph messages that share one conversation into a MonoThread.
 * The thread id is the conversationId (supplementary — see [A1]); RFC 5322
 * References-based regrouping is a known v2 improvement.
 */
export function transformGraphThread(
  messages: GraphMessage[],
  accountId: string,
  options: GraphTransformOptions = {}
): IMonoThread {
  const mapped = messages
    .map((m) => transformGraphMessage(m, options))
    .sort((a, b) => a.timestamp - b.timestamp);

  const first = mapped[0];
  const last = mapped[mapped.length - 1];

  const labelIds = Array.from(new Set(mapped.flatMap((m) => m.labelIds)));
  const aggAttachments = mapped.reduce<Record<string, MonoAttachment>>(
    (acc, m) => ({ ...acc, ...m.attachments }),
    {}
  );

  const uniqueField = (field: 'from' | 'to' | 'cc' | 'bcc'): MonoRecipient[] => {
    const seen = new Set<string>();
    const result: MonoRecipient[] = [];
    for (const msg of mapped) {
      const vals: MonoRecipient[] = field === 'from' ? [msg.from] : (msg[field] as MonoRecipient[]);
      for (const recipient of vals ?? []) {
        if (!recipient?.email || seen.has(recipient.email)) continue;
        seen.add(recipient.email);
        result.push(recipient);
      }
    }
    return result;
  };

  // Construct via the MonoMessage ctor (not fromGmailMessage) so bodyHtml/
  // bodyPlain survive onto the items; payload is always present.
  const items = mapped.map((m) => new MonoMessage(m));

  return {
    accountId,
    id: messages[0]?.conversationId ?? first?.id ?? '',
    historyId: null,
    labelIds,
    attachments: aggAttachments,
    from: uniqueField('from'),
    to: uniqueField('to'),
    cc: uniqueField('cc'),
    bcc: uniqueField('bcc'),
    subject: first?.subject ?? '',
    snippet: last?.snippet ?? first?.snippet ?? '',
    timestamp: last?.timestamp ?? Date.now(),
    items
  };
}
