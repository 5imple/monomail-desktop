import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { DraftAttachmentRecord } from '@/renderer/app/lib/db/types/index';

// Latin1-safe base64 for raw bytes. Chunked to avoid call-stack limits.
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

// UTF-8-safe base64 (btoa is Latin1-only, so encode to bytes first).
const utf8ToBase64 = (input: string): string => bytesToBase64(new TextEncoder().encode(input));

const toBase64Url = (input: string): string =>
  utf8ToBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const isNonAscii = (value: string): boolean => /[^\x00-\x7F]/.test(value);

// RFC 2047 "encoded-word" for non-ASCII header values (Subject, display names).
const encodeHeaderWord = (value: string): string =>
  isNonAscii(value) ? `=?UTF-8?B?${utf8ToBase64(value)}?=` : value;

const formatAddress = (email: string, name?: string): string => {
  const address = email.trim();
  const display = name?.trim();
  if (!display) return address;
  return isNonAscii(display)
    ? `${encodeHeaderWord(display)} <${address}>`
    : `"${display.replace(/"/g, '')}" <${address}>`;
};

const joinAddresses = (emails?: string[]): string =>
  (emails ?? [])
    .map((email) => email.trim())
    .filter(Boolean)
    .join(', ');

// 76-char line wrapping per RFC 2045 for base64 content.
const wrapBase64 = (base64: string): string => base64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

// RFC 2231 filename for non-ASCII names; plain quoted otherwise. Gmail accepts both.
const dispositionFilename = (name: string): string => {
  const cleaned = name.replace(/[\r\n"]/g, '');
  return isNonAscii(cleaned)
    ? `filename*=UTF-8''${encodeURIComponent(cleaned)}`
    : `filename="${cleaned}"`;
};

type MimeEntity = { headers: string[]; body: string };

const renderEntity = (entity: MimeEntity): string =>
  `${entity.headers.join('\r\n')}\r\n\r\n${entity.body}`;

const randomBoundary = (prefix: string): string =>
  `${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const multipartEntity = (subtype: string, parts: MimeEntity[]): MimeEntity => {
  const boundary = randomBoundary(subtype);
  const rendered = parts.map((part) => `--${boundary}\r\n${renderEntity(part)}`).join('\r\n');
  return {
    headers: [`Content-Type: multipart/${subtype}; boundary="${boundary}"`],
    body: `${rendered}\r\n--${boundary}--`
  };
};

const htmlEntity = (html: string): MimeEntity => ({
  headers: ['Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64'],
  body: wrapBase64(utf8ToBase64(html))
});

// A single media part (attachment or inline image) from already-base64 content.
const mediaPart = (opts: {
  mimeType: string;
  fileName: string;
  base64: string;
  inline: boolean;
  contentId?: string;
}): MimeEntity => {
  const name = isNonAscii(opts.fileName)
    ? encodeHeaderWord(opts.fileName)
    : opts.fileName.replace(/"/g, '');
  const headers = [
    `Content-Type: ${opts.mimeType || 'application/octet-stream'}; name="${name}"`,
    'Content-Transfer-Encoding: base64'
  ];
  if (opts.inline && opts.contentId) {
    headers.push(`Content-ID: <${opts.contentId}>`);
    headers.push(`Content-Disposition: inline; ${dispositionFilename(opts.fileName)}`);
  } else {
    headers.push(`Content-Disposition: attachment; ${dispositionFilename(opts.fileName)}`);
  }
  return { headers, body: wrapBase64(opts.base64) };
};

// Pull <img src="data:...;base64,..."> images out of the body into cid: inline
// parts, rewriting each src to `cid:<id>`. Gmail (and most clients) strip data:
// URIs from received mail, so inline images must travel as multipart/related.
const extractInlineDataImages = (html: string): { html: string; parts: MimeEntity[] } => {
  if (typeof DOMParser === 'undefined' || !html.includes('data:image/')) {
    return { html, parts: [] };
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parts: MimeEntity[] = [];
  let index = 0;
  doc.querySelectorAll('img[src^="data:"]').forEach((img) => {
    const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(img.getAttribute('src') || '');
    if (!match) return;
    const mimeType = match[1] || 'image/png';
    const base64 = match[2] || '';
    index += 1;
    const ext = (mimeType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'png';
    const contentId = `inline-${index}-${Math.random().toString(36).slice(2)}@monomail`;
    parts.push(
      mediaPart({ mimeType, fileName: `image-${index}.${ext}`, base64, inline: true, contentId })
    );
    img.setAttribute('src', `cid:${contentId}`);
  });
  return { html: doc.body.innerHTML, parts };
};

/**
 * Build a base64url-encoded RFC822 message for Gmail `users.messages.send`.
 *
 * Emits multipart/related for inline (cid:) images and multipart/mixed for file
 * attachments; collapses to a single text/html part when the draft has neither.
 * Reply threading is handled by passing `threadId` to the send API, not via
 * In-Reply-To (the raw Message-ID header isn't retained in MonoMessage).
 */
export async function buildRawMessage(
  draft: MonoDraft,
  attachments: DraftAttachmentRecord[] = []
): Promise<string> {
  const addressHeaders: string[] = [`From: ${formatAddress(draft.from, draft.author?.name)}`];
  const to = joinAddresses(draft.to);
  const cc = joinAddresses(draft.cc);
  const bcc = joinAddresses(draft.bcc);
  if (to) addressHeaders.push(`To: ${to}`);
  if (cc) addressHeaders.push(`Cc: ${cc}`);
  if (bcc) addressHeaders.push(`Bcc: ${bcc}`);
  addressHeaders.push(`Subject: ${encodeHeaderWord(draft.subject || '')}`);

  // Encode locally-held attachment bytes to base64 up front (async blob reads).
  const encoded = await Promise.all(
    attachments.map(async (record) => ({
      record,
      base64: bytesToBase64(new Uint8Array(await record.blob.arrayBuffer()))
    }))
  );
  const storeInlineParts = encoded
    .filter(({ record }) => record.inline && record.contentId)
    .map(({ record, base64 }) =>
      mediaPart({
        mimeType: record.mimeType,
        fileName: record.fileName,
        base64,
        inline: true,
        contentId: record.contentId
      })
    );
  const fileParts = encoded
    .filter(({ record }) => !(record.inline && record.contentId))
    .map(({ record, base64 }) =>
      mediaPart({ mimeType: record.mimeType, fileName: record.fileName, base64, inline: false })
    );

  // Inline images embedded in the body as data: URIs become cid: parts.
  const { html: bodyHtml, parts: dataInlineParts } = extractInlineDataImages(draft.body || '');
  const inlineParts = [...dataInlineParts, ...storeInlineParts];

  // Body, wrapped with inline images as multipart/related when present.
  const html = htmlEntity(bodyHtml);
  const related =
    inlineParts.length > 0 ? multipartEntity('related', [html, ...inlineParts]) : html;

  // Wrap with file attachments as multipart/mixed when present.
  const top = fileParts.length > 0 ? multipartEntity('mixed', [related, ...fileParts]) : related;

  const message = `${[...addressHeaders, 'MIME-Version: 1.0', ...top.headers].join('\r\n')}\r\n\r\n${top.body}`;
  return toBase64Url(message);
}
