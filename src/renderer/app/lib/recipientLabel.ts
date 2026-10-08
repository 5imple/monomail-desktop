/**
 * How a recipient reads in compose chips and suggestion lists: "Name (email)",
 * or just the address when there's no name or the name is the address itself
 * (contacts often store the email as the display name, which rendered as
 * "a@b.com (a@b.com)"). Width is left to CSS truncation — cutting the address
 * in JS hid the part that tells two people at the same domain apart.
 */
export function recipientLabel(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === email.trim().toLowerCase()) return email;
  return `${trimmed} (${email})`;
}

/**
 * Suggestion filter for cmdk: every typed word must appear somewhere in the
 * item's value ("jennifer hutton" finds "Jennifer C. Hutton (…)"), where a
 * single substring test found nothing. Returns 1/0 — cmdk hides 0.
 */
export function matchesAllWords(value: string, search: string): number {
  const haystack = value.toLowerCase();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word)) ? 1 : 0;
}
