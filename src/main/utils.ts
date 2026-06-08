export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

// 8-4-4-4-12 hex layout produced by generateUUID() (and crypto.randomUUID).
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when an id is a locally-generated compose/draft id (a UUID) rather than
 * a real provider thread/message id.
 *
 * [M365 plan A2] This replaces the fragile `id.length < 20` heuristic. That test
 * happened to separate Gmail ids (~16 hex chars) from compose UUIDs (36 chars),
 * but Microsoft Graph immutable ids are ~150 chars — they landed on the "compose"
 * side and were silently misclassified (breaking draft-vs-thread logic, reply
 * threading, and server mutations). A format check is provider-neutral: neither
 * Gmail ids nor Graph base64url ids share the UUID shape.
 */
export function isComposeDraftId(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_SHAPE.test(id);
}
