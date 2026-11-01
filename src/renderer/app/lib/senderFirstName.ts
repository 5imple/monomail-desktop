/**
 * The name to greet a sender by ("Reply to Jane…"): the first name, also
 * from Outlook's "Last, First" form, or the address before the @.
 */
export function senderFirstName(
  from: { name?: string; email?: string } | null | undefined
): string {
  // Quotes around the whole name only: "D'Andre" keeps its apostrophe.
  const name = (from?.name ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  if (name && !name.includes('@')) {
    const comma = name.indexOf(',');
    const before = comma > 0 ? name.slice(0, comma).trim() : name;
    const after = comma > 0 ? name.slice(comma + 1).trim() : '';
    // "Last, First" only when the part before the comma is one word:
    // "Jane Smith, PhD" is still Jane.
    const first = (after && !/\s/.test(before) ? after : before).split(/\s+/)[0];
    if (first) return first;
  }
  return (from?.email ?? '').split('@')[0] ?? '';
}
