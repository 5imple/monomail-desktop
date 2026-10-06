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
