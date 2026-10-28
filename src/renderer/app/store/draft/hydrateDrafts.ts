import { MonoDraft } from '@/main/models/draft/MonoDraft';

/**
 * Adds the drafts read from IndexedDB to an account's in-memory drafts.
 *
 * The in-memory copy wins: a draft saved in this session is newer than what
 * the read returned. Drafts that left the map while the read was in flight
 * (removed, discarded, or queued for sending) stay out, so a slow read can't
 * bring them back. Returns `current` itself when nothing is added, so the
 * caller can skip a store update.
 */
export function mergeHydratedDrafts(
  current: Record<string, MonoDraft>,
  fromDb: MonoDraft[],
  excludedIds: ReadonlySet<string>
): Record<string, MonoDraft> {
  const added: Record<string, MonoDraft> = {};
  for (const draft of fromDb) {
    if (!draft?.id || current[draft.id] || excludedIds.has(draft.id)) continue;
    added[draft.id] = draft;
  }
  if (Object.keys(added).length === 0) return current;
  return { ...added, ...current };
}
