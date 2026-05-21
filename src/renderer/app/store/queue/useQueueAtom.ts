import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { atomWithStorage } from 'jotai/utils';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

/**
 * Piece 1 of P8 — Later Queue (client-only build).
 *
 * Tracks snoozed threads + scheduled drafts in a Jotai atom persisted to
 * IndexedDB. The state only fires while the app is open — there's no
 * backend integration yet (pieces 4 + 6 deferred pending backend
 * contract). When backend ships, this atom becomes the local mirror of
 * server state instead of the source of truth.
 *
 * Shape is intentionally minimal: just enough metadata to render the
 * QueueRow (sender/recipient name, subject, snippet, snooze/send time)
 * without re-fetching the underlying thread or draft.
 */

export interface SnoozedItem {
  id: string;
  threadId: string;
  accountId: string;
  sender: { id: string; name: string; email: string };
  subject: string;
  snippet: string;
  snoozeUntil: string;
  isStarred?: boolean;
  createdAt: string;
}

export interface ScheduledItem {
  id: string;
  draftId: string;
  accountId: string;
  recipients: { id: string; name: string; email: string }[];
  subject: string;
  bodySnippet: string;
  scheduledFor: string;
  attachmentCount: number;
  isReply: boolean;
  createdAt: string;
}

export interface QueueState {
  snoozed: Record<string, SnoozedItem>;
  scheduled: Record<string, ScheduledItem>;
}

const QUEUE_DEFAULT: QueueState = { snoozed: {}, scheduled: {} };

export const queueAtom = atomWithStorage<QueueState>(
  'queue:state:v1',
  QUEUE_DEFAULT,
  createIndexedDBStorage<QueueState>({ defaultValue: QUEUE_DEFAULT })
);

export function useQueueAtom() {
  const [state, setState] = useAtom(queueAtom);

  const snoozedItems = useMemo(() => Object.values(state.snoozed), [state.snoozed]);
  const scheduledItems = useMemo(() => Object.values(state.scheduled), [state.scheduled]);

  const snoozeThread = useCallback(
    (item: Omit<SnoozedItem, 'createdAt'>) => {
      const stamped: SnoozedItem = { ...item, createdAt: new Date().toISOString() };
      setState((prev) => ({ ...prev, snoozed: { ...prev.snoozed, [item.id]: stamped } }));
    },
    [setState]
  );

  const unsnooze = useCallback(
    (itemId: string) => {
      setState((prev) => {
        const { [itemId]: _, ...rest } = prev.snoozed;
        return { ...prev, snoozed: rest };
      });
    },
    [setState]
  );

  const rescheduleSnooze = useCallback(
    (itemId: string, snoozeUntil: string) => {
      setState((prev) => {
        const existing = prev.snoozed[itemId];
        if (!existing) return prev;
        return {
          ...prev,
          snoozed: { ...prev.snoozed, [itemId]: { ...existing, snoozeUntil } }
        };
      });
    },
    [setState]
  );

  const scheduleDraft = useCallback(
    (item: Omit<ScheduledItem, 'createdAt'>) => {
      const stamped: ScheduledItem = { ...item, createdAt: new Date().toISOString() };
      setState((prev) => ({ ...prev, scheduled: { ...prev.scheduled, [item.id]: stamped } }));
    },
    [setState]
  );

  const cancelSchedule = useCallback(
    (itemId: string) => {
      setState((prev) => {
        const { [itemId]: _, ...rest } = prev.scheduled;
        return { ...prev, scheduled: rest };
      });
    },
    [setState]
  );

  const rescheduleSend = useCallback(
    (itemId: string, scheduledFor: string) => {
      setState((prev) => {
        const existing = prev.scheduled[itemId];
        if (!existing) return prev;
        return {
          ...prev,
          scheduled: { ...prev.scheduled, [itemId]: { ...existing, scheduledFor } }
        };
      });
    },
    [setState]
  );

  return {
    snoozedItems,
    scheduledItems,
    snoozeThread,
    unsnooze,
    rescheduleSnooze,
    scheduleDraft,
    cancelSchedule,
    rescheduleSend
  };
}
