// Text helpers for calendar events: reading Outlook's HTML bodies, finding a
// meeting's join link, and picking legible text on an account's accent color.

// Outlook sends event bodies as HTML, and a Teams invite carries a whole
// document (<html><head><style>…). Only real tags count, so text such as
// "x < y > z" or "Agenda <draft>" stays plain.
const HTML_TAG =
  /<(?:html|head|body|div|p|br|span|a|table|tr|td|meta|style|font|b|i|u|strong|em|ul|ol|li|img|hr|h[1-6])\b[^>]*>/i;

export const looksLikeHtml = (text: string): boolean => HTML_TAG.test(text);

// A read-only text rendering of an HTML body: no head, styles or scripts, and
// block elements and <br> as line breaks. DOMParser documents are inert (no
// scripts run, nothing loads).
export const htmlToPlainText = (html: string): string => {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc
      .querySelectorAll('head, style, script, meta, title, noscript')
      .forEach((node) => node.remove());
    doc.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    doc
      .querySelectorAll('p, div, li, tr, table, ul, ol, hr, h1, h2, h3, h4, h5, h6')
      .forEach((node) => node.append('\n'));
    return (doc.body?.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return html;
  }
};

// Teams, Google Meet and Zoom join links, https only.
const JOIN_URL =
  /https:\/\/(?:teams\.microsoft\.com\/l\/meetup-join\/|teams\.live\.com\/meet\/|meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|(?:[\w-]+\.)?zoom\.us\/(?:j|my|w)\/)[^\s"'<>]*/i;

// The first join link in `sources` (most reliable first: conference entry
// points, then location, then the body), with a label naming the service.
export const findJoinLink = (
  sources: Array<string | null | undefined>
): { url: string; label: string } | null => {
  for (const text of sources) {
    const match = text?.match(JOIN_URL);
    if (!match) continue;
    // Bodies are HTML (href="…&amp;…"); prose ends sentences after links.
    const url = match[0].replace(/&amp;/g, '&').replace(/[.,;:!?)\]]+$/, '');
    const label = /teams\./i.test(url)
      ? 'Join Teams meeting'
      : /meet\.google\.com/i.test(url)
        ? 'Join Google Meet'
        : 'Join Zoom meeting';
    return { url, label };
  }
  return null;
};

// Text on a solid accent fill: near-black on the light accents (Yellow,
// Silver, Pink, Green, Orange), white on the saturated and dark ones (Blue,
// Red, Purple, Gray). White was used on every accent, about 1.5:1 on Yellow.
export const DARK_TEXT_ON_ACCENT = 'hsl(24 10% 10%)';
export const readableTextOn = (hex: string): string => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#fff';
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Between ~0.2 and 0.3 near-black measures slightly higher, but white reads
  // better on saturated red and purple; above 0.3 dark text clearly wins.
  return luminance > 0.3 ? DARK_TEXT_ON_ACCENT : '#fff';
};
