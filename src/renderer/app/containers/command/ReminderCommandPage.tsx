import mailApi from '@/main/api/mail/mailApi';
import { generateUUID } from '@/main/utils';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import * as chrono from 'chrono-node';
import dayjs from 'dayjs';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getReminderSuggestions } from './getReminderSuggestions';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';

interface ReminderCommandPageProps {
  reminderValue: string;
  setReminderValue: (name: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

// "Fri, Oct 9 · 9:00 AM", with the year only when it isn't this year.
const formatWhen = (date: Date, separator: string) => {
  const day = dayjs(date);
  const sameYear = day.year() === dayjs().year();
  return day.format(
    sameYear ? `ddd, MMM D [${separator}] h:mm A` : `ddd, MMM D, YYYY [${separator}] h:mm A`
  );
};

const ReminderCommandPage: React.FC<ReminderCommandPageProps> = ({
  reminderValue,
  setReminderValue,
  onClose,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const suggestions = getReminderSuggestions(reminderValue);
  const { activeThreadId, selectedThreads, threadsMap } = useThreadAtom();
  const { updateLabelFromThread } = useThreadLabelAtom();
  const { labelsMapByAccount } = useLabelAtom();
  const { closeDialog } = useDialogs();
  const { addUndoAction } = useUndoManager();

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const targetThreadIds = useMemo(
    () => (activeThreadId ? [activeThreadId] : selectedThreads),
    [activeThreadId, selectedThreads]
  );

  const handleSelect = async (value: string) => {
    bounce();
    const parsedDate = chrono.parseDate(value, new Date(), { forwardDate: true });

    if (!parsedDate) return;
    // Nothing to remind about: say so here (the palette used to just vanish).
    if (targetThreadIds.length === 0) {
      toast(t('toast.reminder_no_target'));
      return;
    }
    const reminderAt = dayjs(parsedDate).format();

    closeDialog('commandPalette');

    let remindersSet = 0;
    let reminderFailures = 0;
    let moveFailures = 0;
    // What Undo has to take back: each reminder, and the inbox move where it
    // happened.
    const created: Array<{
      accountId: string;
      threadId: string;
      reminderId: string;
      moved: boolean;
      reminderLabelId?: string;
    }> = [];

    await Promise.all(
      targetThreadIds.map(async (threadId) => {
        const thread = threadsMap[threadId];
        if (!thread) return;

        const accountId = thread.accountId;
        if (!accountId) {
          console.error(`No account ID found for thread ${thread.id}`);
          return;
        }

        const message = thread.getLastMessage();
        if (!message) return;

        let reminderId: string;
        try {
          const reminder = await mailApi.createReminder({
            uid: accountId,
            threadId: thread.id,
            messageId: message.id,
            reminderAt: reminderAt,
            subject: thread.subject
          });
          reminderId = reminder.id;
          remindersSet++;
        } catch (error) {
          console.error('Error setting reminder:', error);
          reminderFailures++;
          return;
        }

        // Find the Mono/Reminder label for this specific account
        const accountLabels = labelsMapByAccount[accountId] || {};
        const reminderLabel = Object.values(accountLabels).find(
          (label) => label.name === 'Mono/Reminder'
        );
        const entry = {
          accountId,
          threadId,
          reminderId,
          moved: false,
          reminderLabelId: reminderLabel?.id
        };
        created.push(entry);

        // Move the thread out of the inbox (provider-aware: a Graph archive
        // move on Microsoft, INBOX-label removal on Gmail) and tag it
        // Mono/Reminder, pruning it from the local inbox list — the same
        // mechanism markThreadAsDone uses. shouldRemoveThread=true does the
        // local prune so it disappears from the inbox immediately; it
        // resurfaces via the OS notification at the reminder time.
        if (!reminderLabel) {
          // The label is normally created by loadLabels in useLabelAtom.
          console.warn(`Reminder label not found for account ${accountId}`);
        }
        try {
          await updateLabelFromThread(
            accountId,
            [threadId],
            reminderLabel ? [reminderLabel.id] : [],
            ['INBOX'],
            true,
            true
          );
          entry.moved = true;
        } catch (error) {
          // The reminder is already persisted at this point. Reporting a
          // failed inbox move as "reminder failed" both lies to the user and
          // invites a retry that sets a duplicate reminder.
          console.error('Reminder set, but moving the thread failed:', error);
          moveFailures++;
        }
      })
    );

    if (reminderFailures > 0) {
      toast.error(t('toast.error.reminder_set'));
    } else if (moveFailures > 0) {
      toast.warning(t('toast.error.reminder_move'));
    }

    if (remindersSet > 0) {
      // Undo like Move and Done: the conversation left the inbox, and
      // there was no way to bring it back short of waiting for the reminder.
      let undone = false;
      const undo = async () => {
        if (undone) return;
        undone = true;
        await Promise.all(
          created.map(async (entry) => {
            await mailApi.deleteReminder(entry.accountId, entry.reminderId);
            if (entry.moved) {
              await updateLabelFromThread(
                entry.accountId,
                [entry.threadId],
                ['INBOX'],
                entry.reminderLabelId ? [entry.reminderLabelId] : [],
                true,
                false,
                true
              );
            }
          })
        );
      };
      const toastId = generateUUID();
      addUndoAction({ execute: undo, timestamp: Date.now(), toastId });
      if (reminderFailures === 0 && moveFailures === 0) {
        toast.success(t('toast.reminder_set_for', { when: formatWhen(parsedDate, 'at') }), {
          id: toastId,
          action: {
            label: (
              <span className="inline-flex items-end gap-1">
                {t('toast.undo')}{' '}
                <ShortcutKeyboard variant="text" className="gap-0" shortcut={'Z'} />
              </span>
            ),
            onClick: () => void undo()
          }
        });
      }
    }
  };

  useLayoutEffect(() => {
    if (!loading) {
      setTimeout(() => {
        if (commandListRef.current) {
          const computedHeight = commandListRef.current.scrollHeight;
          setListHeight(computedHeight < 300 ? computedHeight : 300);
        }
      }, 0);
    }
  }, [reminderValue]);

  return (
    <div className="flex flex-col">
      <EnhancedCommandInput
        autoFocus
        placeholder={t('command_palette.reminder.placeholder')}
        value={reminderValue}
        onKeyDown={onKeydown}
        onValueChange={setReminderValue}
      />

      <CommandList
        className="origin-top transition-all duration-200 ease-bouncy-in-out"
        style={
          listHeight === undefined
            ? { transition: 'height 300ms' }
            : { transition: 'height 300ms', height: `${listHeight}px` }
        }
      >
        <div ref={commandListRef}>
          <CommandEmpty>{t('command_palette.reminder.no_suggestions')}</CommandEmpty>
          <CommandGroup heading={t('command_palette.header.suggestions')} className="p-2">
            {suggestions.map((sugg) => {
              const when = chrono.parseDate(sugg.value, new Date(), { forwardDate: true });
              return (
                <CommandItem
                  key={sugg.label}
                  variant={'raycast'}
                  value={reminderValue + sugg.value}
                  onSelect={() => handleSelect(sugg.value)}
                >
                  <CommandIcon type="Calendar" />
                  <span className="min-w-0 flex-1 truncate">{sugg.label}</span>
                  {when && (
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                      {formatWhen(when, '·')}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </div>
      </CommandList>
    </div>
  );
};

export default ReminderCommandPage;
