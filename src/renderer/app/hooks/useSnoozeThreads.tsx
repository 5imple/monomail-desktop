import { MonoThread } from '@/main/models/thread/MonoThread';
import { generateUUID } from '@/main/utils';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import { currentSearchQueryAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { useStore } from 'jotai';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// "Tue, Oct 13, 8:00 AM" — the snooze time, without seconds.
export const formatSnoozeTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

/**
 * The one snooze action behind every Snooze control (row hover button, the
 * reader's Snooze, the palette's "Snooze until…" page, the selection bar).
 *
 * A snooze takes the conversation out of the inbox now and the local
 * scheduler brings it back at the chosen time (it shows under Later until
 * then). Snoozing the open email moves the reader on to the next one, like
 * Done. One toast with Undo (Z) covers the whole batch.
 */
export const useSnoozeThreads = () => {
  const { t } = useTranslation();
  const { snoozeThread, unsnooze } = useQueueAtom();
  const { markThreadAsDone, unmarkThreadAsDone } = useThreadLabelAtom();
  const { activeThreadId, selectNextThread } = useThreadAtom();
  const { addUndoAction } = useUndoManager();
  const store = useStore();
  // A second pick while the first request is in flight would snooze twice.
  const snoozingRef = useRef(false);

  const snoozeThreads = useCallback(
    async (threads: MonoThread[], snoozeUntil: string): Promise<boolean> => {
      if (threads.length === 0 || snoozingRef.current) return false;
      snoozingRef.current = true;
      try {
        // The snooze takes the thread out of the inbox on the server; show that
        // now, the way Done does (off the list in the inbox view), rather than
        // when the next sync notices. Local only — the snooze made the change.
        const query = store.get(currentSearchQueryAtom).toLowerCase();
        const inInboxView =
          (query.includes('in:inbox') && !query.includes('not in:inbox')) ||
          query.includes('category:primary');
        const leaveInbox = (thread: MonoThread) =>
          markThreadAsDone(
            thread.accountId,
            [thread.id],
            false,
            inInboxView,
            false,
            thread.id === activeThreadId ? selectNextThread : undefined
          );
        const backToInbox = (thread: MonoThread) =>
          unmarkThreadAsDone(thread.accountId, [thread.id], false, false, inInboxView);

        const snoozed: Array<{ thread: MonoThread; snoozeId: string }> = [];
        let failures = 0;
        await Promise.all(
          threads.map(async (thread) => {
            const sender = thread.from?.[0];
            await leaveInbox(thread);
            // A rejected call is a failure too: never leave the thread off the list.
            const res = await snoozeThread({
              threadId: thread.id,
              accountId: thread.accountId,
              snoozeUntil,
              threadSnapshot: {
                subject: thread.subject || '',
                snippet: thread.snippet || '',
                from: {
                  id: sender?.email || thread.id,
                  name: sender?.name || sender?.email || 'Unknown',
                  email: sender?.email || ''
                },
                isStarred: thread.labelIds?.includes('STARRED') ?? false
              }
            }).catch((error: unknown) => ({ ok: false as const, error: String(error) }));
            if (!res.ok) {
              console.error('[snooze] snooze failed:', res.error);
              failures++;
              await backToInbox(thread);
              return;
            }
            snoozed.push({ thread, snoozeId: res.item.id });
          })
        );

        if (failures > 0) {
          toast.error(
            threads.length === 1
              ? t('toast.snooze.error', { defaultValue: "Couldn't snooze this email." })
              : t('toast.snooze.error_some', {
                  defaultValue: "Couldn't snooze {{count}} of these emails.",
                  count: failures
                })
          );
        }
        if (snoozed.length === 0) return false;

        let undone = false;
        const undo = async () => {
          if (undone) return;
          undone = true;
          await Promise.all(
            snoozed.map(async ({ thread, snoozeId }) => {
              await backToInbox(thread);
              const result = await unsnooze(snoozeId);
              if (!result.ok) {
                console.error('[snooze] unsnooze failed:', result.error);
                await leaveInbox(thread);
                toast.error(
                  t('toast.snooze.undo_error', { defaultValue: "Couldn't undo the snooze." })
                );
              }
            })
          );
        };
        const toastId = generateUUID();
        addUndoAction({ execute: undo, timestamp: Date.now(), toastId });
        const time = formatSnoozeTime(snoozeUntil);
        toast.success(
          snoozed.length === 1
            ? t('toast.snooze.success', { defaultValue: 'Snoozed until {{time}}', time })
            : t('toast.snooze.success_multiple', {
                defaultValue: '{{count}} conversations snoozed until {{time}}',
                count: snoozed.length,
                time
              }),
          {
            id: toastId,
            action: {
              label: (
                <span className="inline-flex items-end gap-1">
                  {t('toast.undo', { defaultValue: 'Undo' })}{' '}
                  <ShortcutKeyboard variant="text" className="gap-0" shortcut={'Z'} />
                </span>
              ),
              onClick: () => void undo()
            }
          }
        );
        return true;
      } finally {
        snoozingRef.current = false;
      }
    },
    [
      activeThreadId,
      addUndoAction,
      markThreadAsDone,
      selectNextThread,
      snoozeThread,
      store,
      t,
      unmarkThreadAsDone,
      unsnooze
    ]
  );

  return { snoozeThreads };
};
