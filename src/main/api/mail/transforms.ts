import { MonoAttachment, MonoRecipient } from '@/main/models/types';
import { IMonoThread } from '@/main/models/thread/MonoThread';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import {
  MailMessage,
  MailMessagePayload,
  MailMessageBody,
  MailHistoryListResponse,
  MailHistory,
  MailHistoryMessage,
  MailHistoryLabel
} from '@/main/api/mail/types';

// ── Raw Gmail API shapes ─────────────────────────────────────────────────────

interface RawHeader { name: string; value: string; }
interface RawBody { attachmentId?: string; size: number; data?: string; }
export interface RawPayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: RawHeader[];
  body?: RawBody;
  parts?: RawPayload[];
}
export interface RawGmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: RawPayload;
  sizeEstimate?: number;
}
export interface RawGmailThread {
  id: string;
  historyId?: string;
  snippet?: string;
  messages?: RawGmailMessage[];
}
export interface RawGmailThreadListResponse {
  threads?: Array<{ id: string; snippet?: string; historyId?: string }>;
  nextPageToken?: string;
}
interface RawGmailHistoryMessage {
  message: { id: string; threadId: string; labelIds?: string[] };
}
interface RawGmailHistoryItem {
  id?: string;
  messagesAdded?: RawGmailHistoryMessage[];
  messagesDeleted?: RawGmailHistoryMessage[];
  labelsAdded?: RawGmailHistoryMessage[];
  labelsRemoved?: RawGmailHistoryMessage[];
}
export interface RawGmailHistoryListResponse {
  history?: RawGmailHistoryItem[];
  historyId?: string;
  nextPageToken?: string;
}
export interface RawGmailLabel {
  id: string;
  name: string;
  type?: string;
  color?: { textColor?: string; backgroundColor?: string };
  threadsTotal?: number;
  threadsUnread?: number;
  messagesTotal?: number;
  messagesUnread?: number;
}
export interface RawGmailLabelListResponse {
  labels?: RawGmailLabel[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getHeader(headers: RawHeader[] | undefined, name: string): string {
  const lower = name.toLowerCase();
  return headers?.find((h) => h.name.toLowerCase() === lower)?.value ?? '';
}

function parseAddress(raw: string): MonoRecipient {
  const m = raw.trim().match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim() };
  return { name: '', email: raw.trim() };
}

function parseAddressList(raw: string): MonoRecipient[] {
  if (!raw) return [];
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of raw) {
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter(Boolean).map(parseAddress);
}

function parseListUnsubscribe(raw: string): { url: string[]; mailTo: string[] } {
  const urls: string[] = [];
  const mailTo: string[] = [];
  for (const m of (raw.match(/<([^>]+)>/g) ?? [])) {
    const val = m.slice(1, -1);
    if (val.startsWith('mailto:')) mailTo.push(val.slice(7));
    else urls.push(val);
  }
  return { url: urls, mailTo };
}

function normalizeContentId(value?: string): string {
  if (!value) return '';

  let normalized = value.trim().replace(/^cid:/i, '').replace(/^<|>$/g, '');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Some Content-ID values are not URI-encoded even when they contain %.
  }

  return normalized.trim().replace(/^<|>$/g, '');
}

function parseTimezone(dateHeader: string): string {
  const m = dateHeader.match(/([+-]\d{4}|UTC|GMT)\s*$/);
  return m ? m[1] : 'UTC';
}

function walkParts(
  part: RawPayload,
  inlineImages: Record<string, MonoAttachment>,
  attachments: Record<string, MonoAttachment>
): void {
  const headers = part.headers ?? [];
  const rawCid = getHeader(headers, 'Content-ID');
  const cid = normalizeContentId(rawCid);
  const attachmentId = part.body?.attachmentId;
  const filename = part.filename ?? '';

  if (attachmentId) {
    const entry: MonoAttachment = {
      attachmentId,
      fileName: filename,
      mimeType: part.mimeType ?? '',
      size: part.body?.size ?? 0,
    };
    if (cid) {
      inlineImages[cid] = entry;
    } else if (filename) {
      attachments[filename] = entry;
    }
  }

  for (const sub of part.parts ?? []) {
    walkParts(sub, inlineImages, attachments);
  }
}

function toPayload(raw: RawPayload | undefined): MailMessagePayload {
  if (!raw) {
    return { partId: '', mimeType: 'text/plain', fileName: '', body: { attachmentId: null, size: 0, data: null } };
  }
  const body: MailMessageBody = {
    attachmentId: raw.body?.attachmentId ?? null,
    size: raw.body?.size ?? 0,
    data: raw.body?.data ?? null,
  };
  return {
    partId: raw.partId ?? '',
    mimeType: raw.mimeType ?? '',
    fileName: raw.filename ?? '',
    body,
    parts: raw.parts?.map(toPayload),
  };
}

// ── Public transforms ────────────────────────────────────────────────────────

export function transformMessage(raw: RawGmailMessage): MailMessage {
  const headers = raw.payload?.headers ?? [];
  const inlineImages: Record<string, MonoAttachment> = {};
  const attachments: Record<string, MonoAttachment> = {};
  if (raw.payload) walkParts(raw.payload, inlineImages, attachments);

  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    snippet: raw.snippet ?? null,
    historyId: raw.historyId ?? null,
    timestamp: parseInt(raw.internalDate ?? '0', 10),
    timezone: parseTimezone(getHeader(headers, 'Date')),
    subject: getHeader(headers, 'Subject'),
    from: parseAddress(getHeader(headers, 'From')),
    to: parseAddressList(getHeader(headers, 'To')),
    cc: parseAddressList(getHeader(headers, 'Cc')),
    bcc: parseAddressList(getHeader(headers, 'Bcc')),
    listUnsubscribe: parseListUnsubscribe(getHeader(headers, 'List-Unsubscribe')),
    inlineImages,
    attachments,
    inlineImageSize: Object.values(inlineImages).reduce((s, a) => s + a.size, 0),
    payload: toPayload(raw.payload),
  };
}

export function transformThread(raw: RawGmailThread, accountId: string): IMonoThread {
  const messages = (raw.messages ?? []).map(transformMessage);
  const last = messages[messages.length - 1];
  const first = messages[0];

  const labelIds = Array.from(new Set(messages.flatMap((m) => m.labelIds)));
  const aggAttachments = messages.reduce<Record<string, MonoAttachment>>(
    (acc, m) => ({ ...acc, ...m.attachments }),
    {}
  );

  const uniqueField = (field: 'from' | 'to' | 'cc' | 'bcc'): MonoRecipient[] => {
    const seen = new Set<string>();
    const result: MonoRecipient[] = [];
    for (const msg of messages) {
      const vals: MonoRecipient[] = field === 'from' ? [msg.from] : (msg[field] as MonoRecipient[]);
      for (const r of vals ?? []) {
        if (!r?.email || seen.has(r.email)) continue;
        seen.add(r.email);
        result.push(r);
      }
    }
    return result;
  };

  // Cast MailMessage to GmailMessage — they are structurally identical.
  // Skip any without a payload — fromGmailMessage requires it and throws otherwise.
  const items = messages
    .filter((m) => (m as any)?.payload)
    .map((m) => MonoMessage.fromGmailMessage(m as any));

  return {
    accountId,
    id: raw.id,
    historyId: raw.historyId ?? null,
    labelIds,
    attachments: aggAttachments,
    from: uniqueField('from'),
    to: uniqueField('to'),
    cc: uniqueField('cc'),
    bcc: uniqueField('bcc'),
    subject: first?.subject ?? '',
    snippet: raw.snippet ?? last?.snippet ?? '',
    timestamp: last?.timestamp ?? Date.now(),
    items,
  };
}

export function transformHistoryList(raw: RawGmailHistoryListResponse): MailHistoryListResponse {
  const history: MailHistory[] = (raw.history ?? []).map((item) => ({
    messagesAdded: (item.messagesAdded ?? []).map(
      (e): MailHistoryMessage => ({ id: e.message.id, threadId: e.message.threadId })
    ),
    messagesDeleted: (item.messagesDeleted ?? []).map(
      (e): MailHistoryMessage => ({ id: e.message.id, threadId: e.message.threadId })
    ),
    labelsAdded: (item.labelsAdded ?? []).map(
      (e): MailHistoryLabel => ({
        id: e.message.id,
        threadId: e.message.threadId,
        labelIds: e.message.labelIds ?? [],
      })
    ),
    labelsRemoved: (item.labelsRemoved ?? []).map(
      (e): MailHistoryLabel => ({
        id: e.message.id,
        threadId: e.message.threadId,
        labelIds: e.message.labelIds ?? [],
      })
    ),
  }));

  return {
    history: history.length > 0 ? history : null,
    historyId: raw.historyId ?? '',
    nextPageToken: raw.nextPageToken,
  };
}
