/**
 * First name for compact labels (pinned chips, drag previews).
 *
 * Exchange/GAL names often arrive as "Surname, Given" ("Reneer, Kaitlyn").
 * Only that exact shape — a single token before the comma — is flipped, so
 * "John Smith, Jr." still yields "John". Falls back to the email local-part
 * when there is no usable name.
 */
export function shortName(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim() ?? '';
  const surnameFirst = /^([^,\s]+),\s*(\S+)/.exec(trimmed);
  const first = surnameFirst ? surnameFirst[2] : trimmed.split(/\s+/)[0];
  return first || email?.split('@')[0] || '';
}
