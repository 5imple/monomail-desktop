type Recipient = { email: string };

/**
 * Recipients for Reply All to `message`: the sender and everyone on To go to
 * To, everyone on Cc stays on Cc. Your own addresses are dropped (so replying
 * all to your own message goes to its original recipients) and each address
 * appears once, case-insensitively. Bcc is never copied.
 */
export function buildReplyAllRecipients(
  message: { from: Recipient; to: Recipient[]; cc: Recipient[] },
  ownEmails: Iterable<string>
): { to: string[]; cc: string[] } {
  const own = new Set([...ownEmails].map((email) => email.trim().toLowerCase()));
  const seen = new Set<string>();

  const take = (target: string[], email?: string) => {
    const trimmed = email?.trim();
    const key = trimmed?.toLowerCase();
    if (!trimmed || !key || own.has(key) || seen.has(key)) return;
    seen.add(key);
    target.push(trimmed);
  };

  const to: string[] = [];
  take(to, message.from.email);
  message.to.forEach((recipient) => take(to, recipient.email));

  const cc: string[] = [];
  message.cc.forEach((recipient) => take(cc, recipient.email));

  return { to, cc };
}

/** "Re: subject", without stacking prefixes. */
export function replySubject(subject: string): string {
  return subject.toLowerCase().startsWith('re: ') ? subject : `Re: ${subject}`;
}

/**
 * Recipients for plain Reply: the sender only. Replying to your own message
 * goes to its original To. Cc and Bcc are never copied (that's Reply All).
 */
export function buildReplyRecipients(
  message: { from: Recipient; to: Recipient[] },
  ownEmails: Iterable<string>
): string[] {
  const own = new Set([...ownEmails].map((email) => email.trim().toLowerCase()));
  const fromSelf = own.has(message.from.email.trim().toLowerCase());
  return fromSelf ? message.to.map((recipient) => recipient.email) : [message.from.email];
}

/**
 * Which messages of a conversation the reply actions answer: Reply the latest
 * one from someone else (in a conversation you only sent to, your own latest,
 * so the reply goes to its recipients); Reply all and Forward the newest.
 * Addresses compare case-insensitively.
 */
export function replyTargets<T extends { from?: { email?: string } | null }>(
  messages: T[],
  ownEmails: Iterable<string>
): { replyTarget: T | null; latest: T | null; fromOthers: boolean } {
  const own = new Set([...ownEmails].map((email) => email.trim().toLowerCase()));
  const others = messages.filter(
    (message) => !own.has((message.from?.email ?? '').trim().toLowerCase())
  );
  const pool = others.length > 0 ? others : messages;
  return {
    replyTarget: pool[pool.length - 1] ?? null,
    latest: messages[messages.length - 1] ?? null,
    fromOthers: others.length > 0
  };
}
