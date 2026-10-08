import { stripExternalBanner } from '@/renderer/app/components/mail/thread/threadRowModel';

/**
 * Helpers for the reader's conversation history: older messages collapse to
 * single-line rows that join into one stack, and long runs of them fold into
 * an "N earlier messages" row.
 */

/** Where a collapsed row sits in its stack of adjacent collapsed rows. */
export type MessageStackPosition = 'single' | 'first' | 'middle' | 'last';

/** Runs longer than this fold their middle into an "N earlier messages" row. */
export const HISTORY_FOLD_MIN = 5;
/** Rows kept visible at the end of a folded run, right above what follows. */
const HISTORY_FOLD_TAIL = 2;

export type HistoryEntry<T> =
  | { kind: 'message'; message: T; collapsed: boolean; stack: MessageStackPosition | null }
  | { kind: 'fold'; key: string; hidden: T[]; stack: MessageStackPosition };

/**
 * Lays out a conversation: folds the middle of long collapsed runs (unless
 * `unfold`), then gives every collapsed row / fold row its position in the
 * stack of adjacent collapsed rows. Expanded messages break a stack.
 */
export function layoutConversation<T>(
  messages: T[],
  isCollapsed: (message: T, index: number) => boolean,
  getKey: (message: T) => string,
  unfold: boolean
): HistoryEntry<T>[] {
  const entries: HistoryEntry<T>[] = [];
  let run: T[] = [];

  const flushRun = () => {
    if (run.length >= HISTORY_FOLD_MIN && !unfold) {
      const hidden = run.slice(1, run.length - HISTORY_FOLD_TAIL);
      entries.push({ kind: 'message', message: run[0], collapsed: true, stack: null });
      entries.push({ kind: 'fold', key: `fold:${getKey(hidden[0])}`, hidden, stack: 'middle' });
      run.slice(run.length - HISTORY_FOLD_TAIL).forEach((message) => {
        entries.push({ kind: 'message', message, collapsed: true, stack: null });
      });
    } else {
      run.forEach((message) => {
        entries.push({ kind: 'message', message, collapsed: true, stack: null });
      });
    }
    run = [];
  };

  messages.forEach((message, index) => {
    if (isCollapsed(message, index)) {
      run.push(message);
      return;
    }
    flushRun();
    entries.push({ kind: 'message', message, collapsed: false, stack: null });
  });
  flushRun();

  // Stack positions over the final layout (fold rows included).
  const stacked = (entry: HistoryEntry<T> | undefined) =>
    !!entry && (entry.kind === 'fold' || entry.collapsed);
  entries.forEach((entry, i) => {
    if (!stacked(entry)) return;
    const prev = stacked(entries[i - 1]);
    const next = stacked(entries[i + 1]);
    entry.stack = prev && next ? 'middle' : prev ? 'last' : next ? 'first' : 'single';
  });

  return entries;
}

// Where quoted history starts inside a plain-text preview. Graph's
// bodyPreview / Gmail's snippet run the reply straight into the quote
// ("Thanks! Sent from my iPhone On Thu, Sep 24, 2026 at 8:23 PM, …").
const HISTORY_MARKERS = [
  /\s*\bSent from my \w+/i,
  /\s*\bGet Outlook for \w+/i,
  // "On Thu, Sep 24, 2026 …" / "On 24 Sep 2026 …" / "On Sep 24, 2026 …"
  /\s+On (?:[A-Z][a-z]{2,8},? )?(?:[A-Z][a-z]{2,8}\.? \d{1,2}|\d{1,2} [A-Z][a-z]{2,8}\.?),? \d{4}\b/,
  // "On 9/24/26, …" / "On 2026-09-24 …"
  /\s+On \d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/,
  /\s*-{2,}\s*Original Message\s*-{2,}/i,
  /\s*-{2,}\s*Forwarded message\s*-{2,}/i,
  /\s*_{8,}/,
  // Outlook's quoted header block: "From: … Sent: …" / "From: … Date: …"
  /\s+From: .{1,120}?\b(?:Sent|Date): /i
];

/**
 * The reply's own words from a message preview: quoted history and mobile
 * signatures are cut off, whitespace is collapsed. Falls back to the whole
 * preview when nothing would remain (e.g. a forward with no added text).
 */
export function cleanHistorySnippet(snippet: string | null | undefined): string {
  // Leading security banners (org "External Email" notice, Microsoft's
  // first-contact tip) say nothing about the reply itself.
  const text = stripExternalBanner((snippet ?? '').replace(/\s+/g, ' ')).trim();
  if (!text) return '';
  let end = text.length;
  for (const marker of HISTORY_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < end) end = match.index;
  }
  const head = text.slice(0, end).trim();
  return head.length > 0 ? head : text;
}
