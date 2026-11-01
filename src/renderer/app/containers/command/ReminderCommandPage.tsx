import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { useSnoozeThreads } from '@/renderer/app/hooks/useSnoozeThreads';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import * as chrono from 'chrono-node';
import dayjs from 'dayjs';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getReminderSuggestions, type Suggestion } from './getReminderSuggestions';

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

/**
 * The palette's "Snooze until…" page (H in the reader or on a selection): a
 * time typed in plain words — "tomorrow 9am", "in 2 hours", "next monday".
 * It's the same snooze as the row and reader buttons (useSnoozeThreads), so
 * the email leaves the inbox, shows under Later, and comes back on time.
 */
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
  const { closeDialog } = useDialogs();
  const { snoozeThreads } = useSnoozeThreads();

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);
  const targetThreadIds = useMemo(
    () => (activeThreadId ? [activeThreadId] : selectedThreads),
    [activeThreadId, selectedThreads]
  );

  const handleSelect = async (suggestion: Suggestion) => {
    bounce();
    // Re-read the value so "in 2 hours" counts from now, not from when the
    // list was drawn; absolute rows re-read to the same time they show.
    const now = new Date();
    const reparsed = chrono.parseDate(suggestion.value, now, { forwardDate: true });
    const when = reparsed && reparsed > now ? reparsed : suggestion.date;
    if (!(when > now)) return;
    const threads = targetThreadIds.map((id) => threadsMap[id]).filter(Boolean);
    // Nothing to snooze: say so here (the palette used to just vanish).
    if (threads.length === 0) {
      toast(t('toast.reminder_no_target'));
      return;
    }

    closeDialog('commandPalette');
    onClose();
    await snoozeThreads(threads, dayjs(when).toISOString());
  };

  useLayoutEffect(() => {
    setTimeout(() => {
      if (commandListRef.current) {
        const computedHeight = commandListRef.current.scrollHeight;
        setListHeight(computedHeight < 300 ? computedHeight : 300);
      }
    }, 0);
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
            {/* One row per time, best first: Enter takes the first. Values are
                unique, and prefixed with the input so cmdk's filter keeps every
                row in this order. */}
            {suggestions.map((sugg) => (
              <CommandItem
                key={sugg.value}
                variant={'raycast'}
                value={reminderValue + sugg.value}
                onSelect={() => handleSelect(sugg)}
              >
                <CommandIcon type="Clock" />
                <span className="min-w-0 flex-1 truncate">{sugg.label}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                  {formatWhen(sugg.date, '·')}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </div>
      </CommandList>
    </div>
  );
};

export default ReminderCommandPage;
