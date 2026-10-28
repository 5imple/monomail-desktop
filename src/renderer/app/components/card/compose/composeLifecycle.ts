import { MonoDraft } from '@/main/models/draft/MonoDraft';

/**
 * What the user can actually change. signatureId (set by the default-signature
 * switcher on open), timestamp and the thread/message ids (rewritten by the
 * first save) change on their own, and comparing them made closing an
 * untouched compose count as an edit.
 */
export const editableSnapshot = (d: MonoDraft): string =>
  JSON.stringify({
    from: d.from,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    body: (d.body ?? '').replace(/<p><\/p>/g, '').trim(),
    attachments: Object.keys(d.attachments ?? {}).sort()
  });

export type CloseOutcome = 'keep' | 'remove-empty' | 'save';

/**
 * What closing compose (Esc, Back, X) does with the draft. Drafts autosave,
 * so closing never asks:
 * - edited → 'save' the last edits now (and say "Draft saved");
 * - untouched and confirmed new → 'remove-empty' (a compose opened and never
 *   typed in leaves nothing in Drafts);
 * - untouched otherwise → 'keep' it as it was. `existedAtOpen` is null until
 *   the saved-draft lookup answers; unknown counts as saved, so a saved draft
 *   is never deleted on a guess.
 */
export function closeOutcome(untouched: boolean, existedAtOpen: boolean | null): CloseOutcome {
  if (!untouched) return 'save';
  return existedAtOpen === false ? 'remove-empty' : 'keep';
}

// Layers that take Escape before compose does.
export const ESCAPE_OWNER_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]';

/**
 * Whether an Escape keydown, after it has been everywhere, is compose's to
 * close on. Whatever took it first — the slash menu, the link / variable
 * popovers (they preventDefault), the recipient suggestions (they stop it), a
 * dialog or menu over compose, an IME composition — keeps it.
 */
export function escapeClosesCompose(
  event: Pick<KeyboardEvent, 'defaultPrevented' | 'isComposing'>,
  doc: Pick<Document, 'querySelector'>
): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  return !doc.querySelector(ESCAPE_OWNER_SELECTOR);
}

// Template merge fields: {first_name}, {Company}. The variable chips in the
// editor use the same pattern.
const VARIABLE_PATTERN = /\{([^{}\n]{1,60})\}/g;

/** The distinct {variables} still in a message's text. */
export function findUnfilledVariables(text: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  VARIABLE_PATTERN.lastIndex = 0;
  while ((match = VARIABLE_PATTERN.exec(text ?? ''))) {
    const name = match[1].trim();
    if (name) names.add(`{${name}}`);
  }
  return [...names];
}

/** Whether a compose should start on the default signature, and which kind it is. */
export function signatureKind(subject: string, messageId?: string): 'new' | 'reply' | 'forward' {
  if (/^fwd?:/i.test(subject ?? '')) return 'forward';
  if ((messageId?.length ?? 0) > 0 || /^re:/i.test(subject ?? '')) return 'reply';
  return 'new';
}

/**
 * The reply-all recipients missing from a reply, and what To/Cc become when
 * they're added; or, when all are already there, what going back to the
 * sender only looks like. Addresses compare case-insensitively.
 */
export function toggleReplyAll(
  current: { to: string[]; cc: string[] },
  replyAll: { to: string[]; cc: string[] },
  sender: string
): { mode: 'add' | 'remove'; missing: number; to: string[]; cc: string[] } {
  const key = (email: string) => email.trim().toLowerCase();
  const present = new Set([...current.to, ...current.cc].map(key));
  const missingTo = replyAll.to.filter((email) => !present.has(key(email)));
  const missingCc = replyAll.cc.filter((email) => !present.has(key(email)));
  const missing = missingTo.length + missingCc.length;
  if (missing > 0) {
    return {
      mode: 'add',
      missing,
      to: [...current.to, ...missingTo],
      cc: [...current.cc, ...missingCc]
    };
  }
  // Everyone's in: back to the sender alone, keeping anyone the user added
  // who isn't part of reply-all.
  const replyAllKeys = new Set([...replyAll.to, ...replyAll.cc].map(key));
  const senderKey = key(sender);
  const keep = (email: string) => !replyAllKeys.has(key(email)) || key(email) === senderKey;
  const to = current.to.filter(keep);
  return {
    mode: 'remove',
    missing: 0,
    to: to.some((email) => key(email) === senderKey) || !sender ? to : [sender, ...to],
    cc: current.cc.filter(keep)
  };
}
