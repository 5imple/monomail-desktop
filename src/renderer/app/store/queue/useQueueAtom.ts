import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import electronApi from '@/renderer/app/lib/electronApi';
import { buildRawMessage } from '@/renderer/app/lib/mime/buildRawMessage';
import { DBGetDraftById } from '@/renderer/app/lib/db/draft';
import { DBGetAttachmentsForDraft } from '@/renderer/app/lib/db/draftAttachment';
import { useAuth } from '@/renderer/app/context/AuthContext';
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

  // Hydrate from server once we have an account.
  useEffect(() => {
    if (!primaryAccountId) return;
    let cancelled = false;
    (async () => {
      const [snoozeRes, schedRes] = await Promise.all([
        electronApi.queueListSnoozed(primaryAccountId),
        electronApi.queueListScheduled(primaryAccountId)
      ]);
      if (cancelled) return;
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
    return () => {
      cancelled = true;
    };
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
      setState((raw) => { const prev = resolveQueueState(raw); return { ...prev, snoozed: { ...prev.snoozed, [item.id]: item } }; });
      return { ok: true as const, item };
    },
    [setState]
  );

  const unsnooze = useCallback(
    async (snoozeId: string) => {
      // Optimistic — drop from cache immediately. Server-side delete is
      // best-effort; if it fails the next hydrate will restore the row.
      setState((raw) => {
        const prev = resolveQueueState(raw);
        const { [snoozeId]: _removed, ...rest } = prev.snoozed;
        return { ...prev, snoozed: rest };
      });
      const res = await electronApi.queueUnsnooze(snoozeId);
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
    },
    [setState]
  );

  const rescheduleSnooze = useCallback(
    async (snoozeId: string, snoozeUntil: string) => {
      const res = await electronApi.queueRescheduleSnooze({ snoozeId, snoozeUntil });
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = snoozeRecordToItem(res.data);
      setState((raw) => { const prev = resolveQueueState(raw); return { ...prev, snoozed: { ...prev.snoozed, [item.id]: item } }; });
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
      // Standalone: build the raw MIME now (same path as immediate send) so the
      // main-process timer can send it at sendAt without backend/draft access.
      const fullDraft = await DBGetDraftById(req.accountId, req.draftId);
      if (!fullDraft) return { ok: false as const, error: 'Draft not found' };
      const attachmentRecords = await DBGetAttachmentsForDraft(req.accountId, req.draftId);
      const builtRaw = await buildRawMessage(fullDraft, attachmentRecords);
      const threadId =
        fullDraft.threadId && fullDraft.threadId.length < 20 ? fullDraft.threadId : undefined;

      const res = await electronApi.queueSchedule({ ...req, raw: builtRaw, threadId });
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = scheduleRecordToItem(res.data);
      setState((prev2) => {
        const prev = resolveQueueState(prev2);
        return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } };
      });
      return { ok: true as const, item };
    },
    [setState]
  );

  const cancelSchedule = useCallback(
    async (scheduleId: string) => {
      setState((raw) => {
        const prev = resolveQueueState(raw);
        const { [scheduleId]: _removed, ...rest } = prev.scheduled;
        return { ...prev, scheduled: rest };
      });
      const res = await electronApi.queueCancelSchedule(scheduleId);
      return res.ok ? { ok: true as const } : { ok: false as const, error: res.error };
    },
    [setState]
  );

  const rescheduleSend = useCallback(
    async (scheduleId: string, sendAt: string) => {
      const res = await electronApi.queueRescheduleSend({ scheduleId, sendAt });
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = scheduleRecordToItem(res.data);
      setState((raw) => { const prev = resolveQueueState(raw); return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } }; });
      return { ok: true as const };
    },
    [setState]
  );

  const sendScheduledNow = useCallback(
    async (scheduleId: string) => {
      setState((raw) => {
        const prev = resolveQueueState(raw);
        const { [scheduleId]: _removed, ...rest } = prev.scheduled;
        return { ...prev, scheduled: rest };
      });
      const res = await electronApi.queueSendNow(scheduleId);
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
