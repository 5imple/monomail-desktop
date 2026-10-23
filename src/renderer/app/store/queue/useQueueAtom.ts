import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import electronApi from '@/renderer/app/lib/electronApi';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { isBackendConfigured } from '@/main/api/apiClient';
import type {
  ScheduleRecord,
  SnoozeRecord,
  ThreadSnapshot,
  DraftSnapshot
} from '@/main/api/queue/types';
import { atomWithStorage } from 'jotai/utils';
import { getDefaultStore, useAtom } from 'jotai';
import { useCallback, useEffect, useMemo } from 'react';

/**
 * P8 Later Queue — IPC-backed (Phase B, pieces 1 + 4 wired together).
 *
 * The atom is now a local cache mirroring server state. Writes go
 * through main-process IPC (`electronApi.queue*`), which speaks HTTP
 * to `/api/v1/mail/{snooze,schedule}`. Push events fire from the server
 * to `renderer:queue:event` and update the cache. IndexedDB still
 * persists the cache so the queue renders instantly on app reopen,
 * with a server hydrate behind it.
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

// ---- mapping: server record → cache item ---------------------------------

function snoozeRecordToItem(r: SnoozeRecord): SnoozedItem {
  return {
    id: r.snoozeId,
    threadId: r.threadId,
    accountId: r.accountId,
    sender: r.threadSnapshot.from,
    subject: r.threadSnapshot.subject,
    snippet: r.threadSnapshot.snippet,
    snoozeUntil: r.snoozeUntil,
    isStarred: r.threadSnapshot.isStarred,
    createdAt: r.createdAt
  };
}

function scheduleRecordToItem(r: ScheduleRecord): ScheduledItem {
  return {
    id: r.scheduleId,
    draftId: r.draftId,
    accountId: r.accountId,
    recipients: r.draftSnapshot.recipients,
    subject: r.draftSnapshot.subject,
    bodySnippet: r.draftSnapshot.bodySnippet,
    scheduledFor: r.sendAt,
    attachmentCount: r.draftSnapshot.attachmentCount,
    isReply: r.draftSnapshot.isReply,
    createdAt: r.createdAt
  };
}

// ---- push subscription (module singleton) --------------------------------

interface QueueEvent {
  type: string;
  snoozeId?: string;
  scheduleId?: string;
  threadId?: string;
  accountId?: string;
  snoozeUntil?: string;
  sendAt?: string;
  messageId?: string;
}

function resolveQueueState(s: QueueState | Promise<QueueState>): QueueState {
  return s instanceof Promise ? QUEUE_DEFAULT : s;
}

let pushSubscribed = false;
// The account whose queue has been loaded. Module-level, like pushSubscribed:
// this hook sits behind every row's Snooze button, so hydrating per consumer
// re-fetched both lists on every row mount.
let hydratedAccountId: string | null = null;

function ensurePushSubscribed() {
  if (pushSubscribed) return;
  if (!electronApi || typeof electronApi.on !== 'function') return;
  pushSubscribed = true;
  electronApi.on<QueueEvent>('renderer:queue:event', (data) => {
    if (!data || typeof data !== 'object') return;
    const store = getDefaultStore();
    const rawPrev = store.get(queueAtom);
    const prev: QueueState = rawPrev instanceof Promise ? QUEUE_DEFAULT : rawPrev;
    switch (data.type) {
      case 'THREAD_UNSNOOZED': {
        if (!data.snoozeId) return;
        const { [data.snoozeId]: _removed, ...rest } = prev.snoozed;
        store.set(queueAtom, { ...prev, snoozed: rest });
        return;
      }
      case 'SCHEDULED_SENT': {
        if (!data.scheduleId) return;
        const { [data.scheduleId]: _removed, ...rest } = prev.scheduled;
        store.set(queueAtom, { ...prev, scheduled: rest });
        return;
      }
      case 'SNOOZE_RESCHEDULED': {
        if (!data.snoozeId || !data.snoozeUntil) return;
        const item = prev.snoozed[data.snoozeId];
        if (!item) return;
        store.set(queueAtom, {
          ...prev,
          snoozed: {
            ...prev.snoozed,
            [data.snoozeId]: { ...item, snoozeUntil: data.snoozeUntil }
          }
        });
        return;
      }
      case 'SCHEDULE_RESCHEDULED': {
        if (!data.scheduleId || !data.sendAt) return;
        const item = prev.scheduled[data.scheduleId];
        if (!item) return;
        store.set(queueAtom, {
          ...prev,
          scheduled: {
            ...prev.scheduled,
            [data.scheduleId]: { ...item, scheduledFor: data.sendAt }
          }
        });
        return;
      }
    }
  });
}

// ---- hook -----------------------------------------------------------------

export function useQueueAtom() {
  const [rawState, setState] = useAtom(queueAtom);
  const state: QueueState = rawState instanceof Promise ? QUEUE_DEFAULT : rawState;
  const { accounts } = useAuth();
  const primaryAccountId = accounts[0]?.uid ?? '';

  // Subscribe to push events once (idempotent across consumers).
  useEffect(() => {
    ensurePushSubscribed();
  }, []);

  // Hydrate from the scheduler once per account, not once per consumer. The
  // actions below and the push events keep the cache current afterwards, so a
  // consumer unmounting mid-flight no longer cancels the load (the atom is
  // app-wide state, not the component's).
  useEffect(() => {
    if (!primaryAccountId || hydratedAccountId === primaryAccountId) return;
    hydratedAccountId = primaryAccountId;
    (async () => {
      const [snoozeRes, schedRes] = await Promise.all([
        electronApi.queueListSnoozed(primaryAccountId),
        // Scheduled send goes to the backend (ipc-handlers/queue); without one
        // the call can only fail, so don't make it.
        isBackendConfigured()
          ? electronApi.queueListScheduled(primaryAccountId)
          : Promise.resolve({ ok: true as const, data: { items: [] } })
      ]);
      setState((raw) => {
        const prev = resolveQueueState(raw);
        return {
          snoozed: snoozeRes.ok
            ? Object.fromEntries(
                snoozeRes.data.items.map((r) => [r.snoozeId, snoozeRecordToItem(r)])
              )
            : prev.snoozed,
          scheduled: schedRes.ok
            ? Object.fromEntries(
                schedRes.data.items.map((r) => [r.scheduleId, scheduleRecordToItem(r)])
              )
            : prev.scheduled
        };
      });
    })();
  }, [primaryAccountId, setState]);

  const snoozedItems = useMemo(() => Object.values(state.snoozed), [state.snoozed]);
  const scheduledItems = useMemo(() => Object.values(state.scheduled), [state.scheduled]);

  const snoozeThread = useCallback(
    async (req: {
      threadId: string;
      accountId: string;
      snoozeUntil: string;
      threadSnapshot?: ThreadSnapshot;
    }) => {
      const res = await electronApi.queueSnooze(req);
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = snoozeRecordToItem(res.data);
      setState((raw) => {
        const prev = resolveQueueState(raw);
        return { ...prev, snoozed: { ...prev.snoozed, [item.id]: item } };
      });
      return { ok: true as const, item };
    },
    [setState]
  );

  const unsnooze = useCallback(
    async (snoozeId: string) => {
      // Optimistic — drop from cache immediately, and put it back if the
      // server refuses (it stayed gone until the next hydrate, i.e. restart).
      let removed: SnoozedItem | undefined;
      setState((raw) => {
        const prev = resolveQueueState(raw);
        const { [snoozeId]: item, ...rest } = prev.snoozed;
        removed = item;
        return { ...prev, snoozed: rest };
      });
      const res = await electronApi.queueUnsnooze(snoozeId);
      if (!res.ok && removed) {
        const item = removed;
        setState((raw) => {
          const prev = resolveQueueState(raw);
          // Unless a push or hydrate has put it back (or changed it) meanwhile.
          if (prev.snoozed[item.id]) return prev;
          return { ...prev, snoozed: { ...prev.snoozed, [item.id]: item } };
        });
      }
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
    },
    [setState]
  );

  const rescheduleSnooze = useCallback(
    async (snoozeId: string, snoozeUntil: string) => {
      const res = await electronApi.queueRescheduleSnooze({ snoozeId, snoozeUntil });
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = snoozeRecordToItem(res.data);
      setState((raw) => {
        const prev = resolveQueueState(raw);
        return { ...prev, snoozed: { ...prev.snoozed, [item.id]: item } };
      });
      return { ok: true as const };
    },
    [setState]
  );

  const scheduleDraft = useCallback(
    async (req: {
      draftId: string;
      accountId: string;
      sendAt: string;
      draftSnapshot?: DraftSnapshot;
    }) => {
      const res = await electronApi.queueSchedule(req);
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = scheduleRecordToItem(res.data);
      setState((raw) => {
        const prev = resolveQueueState(raw);
        return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } };
      });
      return { ok: true as const, item };
    },
    [setState]
  );

  const cancelSchedule = useCallback(
    async (scheduleId: string) => {
      // Optimistic, restored if the server refuses (see unsnooze).
      let removed: ScheduledItem | undefined;
      setState((raw) => {
        const prev = resolveQueueState(raw);
        const { [scheduleId]: item, ...rest } = prev.scheduled;
        removed = item;
        return { ...prev, scheduled: rest };
      });
      const res = await electronApi.queueCancelSchedule(scheduleId);
      if (!res.ok && removed) {
        const item = removed;
        setState((raw) => {
          const prev = resolveQueueState(raw);
          if (prev.scheduled[item.id]) return prev;
          return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } };
        });
      }
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
    },
    [setState]
  );

  const rescheduleSend = useCallback(
    async (scheduleId: string, sendAt: string) => {
      const res = await electronApi.queueRescheduleSend({ scheduleId, sendAt });
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = scheduleRecordToItem(res.data);
      setState((raw) => {
        const prev = resolveQueueState(raw);
        return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } };
      });
      return { ok: true as const };
    },
    [setState]
  );

  const sendScheduledNow = useCallback(
    async (scheduleId: string) => {
      // Optimistic, restored if the server refuses (see unsnooze).
      let removed: ScheduledItem | undefined;
      setState((raw) => {
        const prev = resolveQueueState(raw);
        const { [scheduleId]: item, ...rest } = prev.scheduled;
        removed = item;
        return { ...prev, scheduled: rest };
      });
      const res = await electronApi.queueSendNow(scheduleId);
      if (!res.ok && removed) {
        const item = removed;
        setState((raw) => {
          const prev = resolveQueueState(raw);
          if (prev.scheduled[item.id]) return prev;
          return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } };
        });
      }
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
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
    rescheduleSend,
    sendScheduledNow,
    primaryAccountId
  };
}
