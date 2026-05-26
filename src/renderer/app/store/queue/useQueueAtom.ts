import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import electronApi from '@/renderer/app/lib/electronApi';
import { toast } from 'sonner';
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
 * Later Queue — backed by the local main-process scheduler (no server).
 *
 * The atom is a local cache. Writes go through main-process IPC
 * (`electronApi.queue*`) to `SchedulerService`, which persists snoozes /
 * scheduled-sends in electron-store and fires them on a periodic sweep.
 * The scheduler emits `renderer:queue:event` (THREAD_UNSNOOZED /
 * SCHEDULED_SENT / *_RESCHEDULED) to keep this cache in sync. IndexedDB
 * persists the cache so the queue renders instantly on reopen, with a
 * scheduler hydrate behind it.
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
  error?: string;
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
      case 'SCHEDULE_FAILED': {
        if (!data.scheduleId) return;
        const failedItem = prev.scheduled[data.scheduleId];
        const { [data.scheduleId]: _failed, ...remaining } = prev.scheduled;
        store.set(queueAtom, { ...prev, scheduled: remaining });
        toast.error(
          failedItem
            ? `Scheduled send failed: "${failedItem.subject || '(no subject)'}"${data.error ? ` — ${data.error}` : ''}`
            : `A scheduled send failed${data.error ? `: ${data.error}` : ''}`
        );
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

  // Hydrate from the local scheduler for ALL connected accounts (the engine
  // stores per-account, so the Later view must query each — not just primary,
  // otherwise secondary-account snoozes/scheduled-sends never appear).
  const accountUidsKey = useMemo(
    () => accounts.map((a) => a.uid).filter(Boolean).join(','),
    [accounts]
  );
  useEffect(() => {
    const uids = accountUidsKey ? accountUidsKey.split(',') : [];
    if (uids.length === 0) return;
    let cancelled = false;
    (async () => {
      const perAccount = await Promise.all(
        uids.map(async (uid) => ({
          snooze: await electronApi.queueListSnoozed(uid),
          sched: await electronApi.queueListScheduled(uid)
        }))
      );
      if (cancelled) return;
      const snoozed: Record<string, SnoozedItem> = {};
      const scheduled: Record<string, ScheduledItem> = {};
      let anyOk = false;
      for (const { snooze, sched } of perAccount) {
        if (snooze.ok) {
          anyOk = true;
          snooze.data.items.forEach((r) => (snoozed[r.snoozeId] = snoozeRecordToItem(r)));
        }
        if (sched.ok) {
          anyOk = true;
          sched.data.items.forEach((r) => (scheduled[r.scheduleId] = scheduleRecordToItem(r)));
        }
      }
      if (!anyOk) return; // all calls failed — keep the cached state
      setState((raw) => {
        const prev = resolveQueueState(raw);
        return { ...prev, snoozed, scheduled };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [accountUidsKey, setState]);

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
      // Resolve the draft under req.accountId, falling back to the primary
      // account in case getUidFromEmail(from) mapped to a different uid.
      let resolvedUid = req.accountId;
      let fullDraft = await DBGetDraftById(resolvedUid, req.draftId);
      if (!fullDraft && primaryAccountId && primaryAccountId !== resolvedUid) {
        const alt = await DBGetDraftById(primaryAccountId, req.draftId);
        if (alt) {
          fullDraft = alt;
          resolvedUid = primaryAccountId;
        }
      }
      if (!fullDraft) return { ok: false as const, error: 'Draft not found' };
      const attachmentRecords = await DBGetAttachmentsForDraft(resolvedUid, req.draftId);
      const builtRaw = await buildRawMessage(fullDraft, attachmentRecords);
      const threadId =
        fullDraft.threadId && fullDraft.threadId.length < 20 ? fullDraft.threadId : undefined;

      const res = await electronApi.queueSchedule({
        ...req,
        accountId: resolvedUid,
        raw: builtRaw,
        threadId
      });
      if (!res.ok) return { ok: false as const, error: res.error };
      const item = scheduleRecordToItem(res.data);
      setState((prev2) => {
        const prev = resolveQueueState(prev2);
        return { ...prev, scheduled: { ...prev.scheduled, [item.id]: item } };
      });
      return { ok: true as const, item };
    },
    [setState, primaryAccountId]
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
