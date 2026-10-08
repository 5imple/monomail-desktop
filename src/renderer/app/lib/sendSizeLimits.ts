// Size budgets enforced in compose, so an oversized message is refused when
// the file is attached (or Send is pressed) instead of failing after the
// undo countdown with a generic error.

const MB = 1024 * 1024;

/** Per-file cap for Gmail accounts (Gmail's own attachment limit). */
export const GMAIL_MAX_FILE_BYTES = 25 * MB;

/**
 * Microsoft Graph sendMail (MIME mode) refuses a request whose base64 MIME is
 * over this (MAX_ENCODED_MIME in microsoftMailProvider).
 */
export const MICROSOFT_MAX_ENCODED_MIME = 4 * MB;

// Headers, boundaries and part headers of a typical message.
const MIME_OVERHEAD_BYTES = 16 * 1024;
// Inside the MIME every part is base64 (4/3) wrapped with CRLF every 76 chars;
// the whole MIME is then base64'd again for the request (another 4/3).
const PART_FACTOR = (4 / 3) * (78 / 76);
const REQUEST_FACTOR = 4 / 3;

/**
 * Encoded request size of a Microsoft send. `bodyBytes` is the HTML body
 * without inline images; `inlineImageBase64Chars` is the base64 already held
 * in data: URIs (re-wrapped, not re-encoded, when they become cid parts).
 */
export function estimateMicrosoftRequestSize({
  attachmentBytes,
  bodyBytes = 0,
  inlineImageBase64Chars = 0
}: {
  attachmentBytes: number;
  bodyBytes?: number;
  inlineImageBase64Chars?: number;
}): number {
  const mimeBytes =
    (attachmentBytes + bodyBytes) * PART_FACTOR +
    inlineImageBase64Chars * (78 / 76) +
    MIME_OVERHEAD_BYTES;
  return Math.ceil(mimeBytes * REQUEST_FACTOR);
}

/**
 * Total attachment bytes a Microsoft account can attach in compose: what fits
 * under the encoded cap, less room for a sizeable body (~190 KB of HTML).
 * Comes out at 2 MB.
 */
export const MICROSOFT_ATTACHMENT_BUDGET_BYTES = 2 * MB;

/** Splits an HTML body into its text bytes and the base64 held in data: images. */
export function measureHtmlBody(html: string): {
  bodyBytes: number;
  inlineImageBase64Chars: number;
} {
  let inlineImageBase64Chars = 0;
  const withoutImages = html.replace(/data:[^;,"']+;base64,([A-Za-z0-9+/=\s]*)/g, (_, data) => {
    inlineImageBase64Chars += data.length;
    return '';
  });
  return { bodyBytes: new TextEncoder().encode(withoutImages).length, inlineImageBase64Chars };
}

/** "2 MB" / "25 MB" / "512 KB" for limit messages. */
export function formatLimit(bytes: number): string {
  if (bytes >= MB) return `${Math.round((bytes / MB) * 10) / 10} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
