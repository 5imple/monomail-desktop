import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { cn } from '@/renderer/app/lib/utils';
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
  const { addLabelToThread } = useThreadLabelAtom();
  const { labelsMapByAccount } = useLabelAtom();
  const { closeDialog } = useDialogs();

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(300);
  const [loading, setLoading] = useState(false);
  const targetThreadIds = useMemo(
    () => (selectedThreads.length > 0 ? selectedThreads : activeThreadId ? [activeThreadId] : []),
    [activeThreadId, selectedThreads]
  );

  const handleSelect = async (value: string) => {
    bounce();
    const parsedDate = chrono.parseDate(value);

    if (!parsedDate) return;
    const reminderAt = dayjs(parsedDate).format();

    closeDialog('commandPalette');
    if (targetThreadIds.length > 0) {
      try {
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

            if (message) {
              await mailApi.createReminder({
                uid: accountId,
                threadId: thread.id,
                messageId: message.id,
                reminderAt: reminderAt,
                subject: thread.subject
              });

              // Find the Mono/Reminder label for this specific account
              const accountLabels = labelsMapByAccount[accountId] || {};
              const reminderLabel = Object.values(accountLabels).find(
                (label) => label.name === 'Mono/Reminder'
              );

              if (reminderLabel) {
                // updateThreadState(accountId, threadId, [reminderLabel.id], [], true);
                await addLabelToThread(accountId, [threadId], reminderLabel.id);
              } else {
                // If label doesn't exist, it should be created, but this should be
                // handled by the loadLabels function in useLabelAtom which creates required labels
                console.warn(`Reminder label not found for account ${accountId}`);
              }
              toast.success(t('toast.reminder_set'));
            }
          })
        );
      } catch (error) {
        console.error('Error setting reminder:', error);
        toast.error(t('toast.error.reminder_set'));
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
        className={cn(
          'h-[0px] origin-top transition-all duration-200 ease-bouncy-in-out',
          loading ? '' : `h-[${listHeight}px]`
        )}
        style={{ transition: 'height 300ms', height: `${listHeight}px` }}
      >
        <div ref={commandListRef}>
          <CommandEmpty>No matching suggestions found.</CommandEmpty>
          <CommandGroup heading={t('command_palette.header.suggestions')} className="p-2">
            {suggestions.map((sugg) => (
              <CommandItem
                key={sugg.label}
                value={reminderValue + sugg.value}
                onSelect={() => handleSelect(sugg.value)}
              >
                <CommandIcon type="Calendar" />
                <div className="flex flex-col">
                  <span>{sugg.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {dayjs(chrono.parseDate(sugg.value)).format('dddd, MMMM D, YYYY @ h:mm A')}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </div>
      </CommandList>
    </div>
  );
};

export default ReminderCommandPage;
