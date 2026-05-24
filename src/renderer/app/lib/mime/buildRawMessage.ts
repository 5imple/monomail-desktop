import { MonoDraft } from '@/main/models/draft/MonoDraft';

// UTF-8-safe base64 (btoa is Latin1-only, so encode to bytes first). Chunked to
// avoid call-stack limits on large bodies.
const utf8ToBase64 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

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

// 76-char line wrapping per RFC 2045 for the base64 body.
const wrapBase64 = (base64: string): string => base64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

/**
 * Build a base64url-encoded RFC822 message for Gmail `users.messages.send`.
 *
 * Text/HTML only — attachments and read-receipt tracking are backend features,
 * so drafts carrying those use the backend send path instead. Reply threading is
 * handled by passing `threadId` to the send API, not via In-Reply-To (the raw
 * Message-ID header isn't retained in MonoMessage).
 */
export function buildRawMessage(draft: MonoDraft): string {
  const headers: string[] = [`From: ${formatAddress(draft.from, draft.author?.name)}`];

  const to = joinAddresses(draft.to);
  const cc = joinAddresses(draft.cc);
  const bcc = joinAddresses(draft.bcc);
  if (to) headers.push(`To: ${to}`);
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);

  headers.push(`Subject: ${encodeHeaderWord(draft.subject || '')}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/html; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: base64');

  const body = wrapBase64(utf8ToBase64(draft.body || ''));
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return toBase64Url(message);
}
