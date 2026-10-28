import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { isComposeDraftId } from '@/main/utils';
import {
  embedQuotedImages,
  formatForwardedMessage,
  formatQuotedReply
} from '@/renderer/app/lib/formatBody';
import {
  finalizeInlineStyles,
  getRootVariables,
  selectCssForHtml
} from '@/renderer/app/lib/mime/emailCss';
import {
  MICROSOFT_MAX_ENCODED_MIME,
  estimateMicrosoftRequestSize,
  measureHtmlBody
} from '@/renderer/app/lib/sendSizeLimits';

/**
 * Turns what was written in compose into the message that goes out: the
 * editor HTML with its styles inlined, the signature, and the quoted reply /
 * forwarded original (its pictures embedded).
 *
 * This runs after Send has closed the card, during the undo countdown, so
 * none of it (CSS inlining, fetching quoted pictures) holds up the UI. juice
 * and the stylesheet are loaded on first use rather than with the app.
 */

type InlineContent = (html: string, css: string) => string;

let inlinerPromise: Promise<{ inlineContent: InlineContent; css: string }> | null = null;

/** juice + the compiled app stylesheet, loaded once. */
export function loadEmailInliner(): Promise<{ inlineContent: InlineContent; css: string }> {
  if (!inlinerPromise) {
    inlinerPromise = Promise.all([
      import('juice'),
      import('@/renderer/app/assets/style/tailwind.css?raw')
    ]).then(([juiceModule, cssModule]) => {
      const juice = (juiceModule.default ?? juiceModule) as unknown as {
        inlineContent: InlineContent;
      };
      return {
        inlineContent: (html: string, css: string) => juice.inlineContent(html, css),
        css: cssModule.default
      };
    });
    // A failed load can be retried by the next send.
    inlinerPromise.catch(() => {
      inlinerPromise = null;
    });
  }
  return inlinerPromise;
}

/** Starts loading the inliner while the browser is idle (compose is open). */
export function prewarmEmailInliner(): void {
  const start = () => void loadEmailInliner().catch(() => undefined);
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(start, { timeout: 2000 });
  } else {
    setTimeout(start, 200);
  }
}

// Gmail drops empty paragraphs; a non-breaking space keeps the blank line.
const keepEmptyParagraphs = (html: string) => html.replace(/(<p[^>]*>)\s*(<\/p>)/g, '$1&nbsp;$2');

// Line breaks (Shift+Enter) and paragraph spacing survive the CSS inlining
// and mail clients' own styles: marked before inlining, forced after.
const markLineBreaks = (root: HTMLElement) => {
  root.querySelectorAll('br').forEach((br) => {
    br.setAttribute('data-preserve-linebreak', 'true');
    br.style.display = 'block';
    br.style.lineHeight = '1.5';
  });
  root.querySelectorAll('p').forEach((p) => {
    p.style.margin = '1em 0';
    p.style.lineHeight = '1.5';
  });
};

const forceLineBreaks = (root: HTMLElement) => {
  root.querySelectorAll('br').forEach((br) => {
    br.style.setProperty('display', 'block', 'important');
    br.style.setProperty('line-height', '1.5', 'important');
    br.style.setProperty('margin', '0', 'important');
    br.style.setProperty('padding', '0', 'important');
    // A non-breaking space so the line break is visible.
    br.insertAdjacentHTML('afterend', '&#160;');
  });
  root.querySelectorAll('p').forEach((p) => {
    p.style.setProperty('margin', '1em 0', 'important');
    p.style.setProperty('line-height', '1.5', 'important');
  });
};

/** The editor HTML with the stylesheet rules it uses inlined, mail-safe. */
export async function inlineEditorHtml(body: string): Promise<string> {
  const { inlineContent, css } = await loadEmailInliner();
  const container = document.createElement('div');
  container.innerHTML = body;
  markLineBreaks(container);
  const wrapped = `<div class="reset-selection">${container.innerHTML}</div>`;
  container.innerHTML = inlineContent(wrapped, `<style>${selectCssForHtml(css, wrapped)}</style>`);
  finalizeInlineStyles(container, getRootVariables(css));
  forceLineBreaks(container);
  return container.innerHTML;
}

export class MessageTooLargeError extends Error {
  constructor() {
    super('The message is over the Microsoft send size limit.');
    // Recognised by the send toasts, which say why.
    this.name = 'MessageTooLargeError';
  }
}

export interface PrepareOutgoingOptions {
  /** The draft as written (editor HTML in `body`). */
  draft: MonoDraft;
  signatureHtml: string;
  /** The message answered (quoted under the reply). */
  replyMessage: MonoMessage | null;
  /** The message forwarded (appended). */
  forwardMessage: MonoMessage | null;
  /** The sending account's uid, to load quoted pictures. */
  uid?: string;
  isMicrosoftAccount: boolean;
  attachmentBytes: number;
}

/** The draft ready for buildRawMessage. Throws MessageTooLargeError. */
export async function prepareOutgoingDraft({
  draft,
  signatureHtml,
  replyMessage,
  forwardMessage,
  uid,
  isMicrosoftAccount,
  attachmentBytes
}: PrepareOutgoingOptions): Promise<MonoDraft> {
  // A new compose's placeholder thread id isn't a conversation to thread into.
  const placeholderThread = isComposeDraftId(draft.threadId);
  const outgoing = new MonoDraft({
    ...draft.toPlainObject(),
    threadId: placeholderThread ? undefined : draft.threadId,
    messageId: placeholderThread ? undefined : draft.messageId
  });

  const body = await inlineEditorHtml(draft.body ?? '');

  // The message answered, quoted under a reply as mail apps do, or the
  // forwarded one.
  let history = replyMessage
    ? formatQuotedReply(replyMessage, isMicrosoftAccount ? 'outlook' : 'gmail')
    : forwardMessage
      ? formatForwardedMessage(forwardMessage)
      : '';
  const original = replyMessage ?? forwardMessage;
  if (original && uid) history = await embedQuotedImages(history, original, uid);

  const html = `<html><body>${body}<div id="mono-signature" class="my-2">${signatureHtml}</div>${history}</body></html>`;
  outgoing.update({ body: keepEmptyParagraphs(html) });

  // Graph refuses an encoded MIME over its cap: say so, with the reason.
  if (isMicrosoftAccount) {
    const size = estimateMicrosoftRequestSize({
      attachmentBytes,
      ...measureHtmlBody(outgoing.body)
    });
    if (size > MICROSOFT_MAX_ENCODED_MIME) throw new MessageTooLargeError();
  }
  return outgoing;
}
