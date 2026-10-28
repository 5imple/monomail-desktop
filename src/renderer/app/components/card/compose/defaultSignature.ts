import { signatureKind } from '@/renderer/app/components/card/compose/composeLifecycle';

interface SignaturePreference {
  includeInNewMessages?: boolean;
  includeInReplies?: boolean;
  includeInForwards?: boolean;
}

/**
 * The signature a new draft starts with: the sending account's default, when
 * Settings › Signature includes one for this kind of message (new, reply,
 * forward). Chosen, not saved: it's added to the message when it's sent.
 * Shared by the compose window and the reader's quick reply.
 */
export function defaultSignatureId(
  draft: { from: string; subject: string; messageId?: string },
  preference: SignaturePreference | undefined,
  getUidFromEmail: (email: string) => string | undefined,
  getDefaultSignature: (uid: string) => { id: string } | undefined
): string | undefined {
  if (!draft.from) return undefined;
  const kind = signatureKind(draft.subject, draft.messageId);
  const include =
    kind === 'new'
      ? preference?.includeInNewMessages
      : kind === 'reply'
        ? preference?.includeInReplies
        : preference?.includeInForwards;
  const uid = include ? getUidFromEmail(draft.from) : undefined;
  return uid ? getDefaultSignature(uid)?.id : undefined;
}
