import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { CustomDateTimePicker } from '@/renderer/app/containers/queue/CustomDateTimePicker';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';
import { buildSchedulePresets } from '@/renderer/app/containers/queue/schedulePresets';
import { useSnoozeThreads } from '@/renderer/app/hooks/useSnoozeThreads';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface ThreadActionButtonProps {
  thread: MonoThread;
  buttonClassName?: string;
}

/**
 * The row's Snooze: a popover of presets (or a custom time). The snooze
 * itself is useSnoozeThreads, shared with the reader, the palette page (H)
 * and the selection bar, so every Snooze does the same thing.
 */
export const SnoozeButton = React.memo<ThreadActionButtonProps>(({ thread, buttonClassName }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const { snoozeThreads } = useSnoozeThreads();
  const presets = useMemo(() => buildSchedulePresets(new Date()), [open]);
  const snoozeLabel = t('command.reminder', { defaultValue: 'Snooze' });
  const heading = t('thread_list.snooze_until', { defaultValue: 'Snooze until' });

  const handlePickPreset = useCallback(
    async (preset: { id: string; scheduledFor: string | null }) => {
      if (!preset.scheduledFor) return;
      // Close right away; the toast reports the outcome.
      setOpen(false);
      await snoozeThreads([thread], preset.scheduledFor);
    },
    [thread, snoozeThreads]
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setCustomMode(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="text"
          typeVariant="inline"
          sizeVariant="xs"
          tabIndex={-1}
          className={
            buttonClassName ??
            'shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100'
          }
          onClick={(e) => {
            e.stopPropagation();
          }}
          data-row-action
          tooltip={snoozeLabel}
          shortcut="H"
          aria-label={snoozeLabel}
        >
          <MonoIcon type="Clock" size={18} weight={300} grade={0} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-auto border-none bg-transparent p-0 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {customMode ? (
          <CustomDateTimePicker
            heading={heading}
            confirmLabel={snoozeLabel}
            onBack={() => setCustomMode(false)}
            onConfirm={(iso) => {
              setCustomMode(false);
              handlePickPreset({ id: 'custom', scheduledFor: iso });
            }}
          />
        ) : (
          <ReschedulePopover
            presets={presets}
            heading={heading}
            onPickPreset={handlePickPreset}
            onPickCustom={() => setCustomMode(true)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
});
SnoozeButton.displayName = 'SnoozeButton';

export const LabelButton = React.memo<ThreadActionButtonProps>(({ thread, buttonClassName }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { labelsMapByAccount } = useLabelAtom();
  const { addLabelToThread } = useThreadLabelAtom();
  const labelTitle = t('command.label', { defaultValue: 'Label' });

  // Only user-created labels (Gmail's are `Label_*`); system labels like
  // INBOX/UNREAD aren't things you "add" from here.
  const userLabels = useMemo(() => {
    const accountLabels = labelsMapByAccount[thread.accountId] || {};
    return Object.values(accountLabels)
      .filter((label) => label.id.startsWith('Label_'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [labelsMapByAccount, thread.accountId]);

  const handleAdd = useCallback(
    async (labelId: string, labelName: string) => {
      setOpen(false);
      if (!thread.accountId || thread.labelIds?.includes(labelId)) return;
      try {
        await addLabelToThread(thread.accountId, [thread.id], labelId);
        toast.success(
          t('toast.label.added', {
            defaultValue: 'Added label {{name}}',
            name: labelName.replace('Mono/', '')
          })
        );
      } catch {
        toast.error(t('toast.error.label_add', { defaultValue: "Couldn't add label" }));
      }
    },
    [thread, addLabelToThread, t]
  );

  // No user labels (e.g. Microsoft 365, where labels aren't loaded): the
  // popover could only ever say "No labels yet", so don't offer it.
  if (userLabels.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="text"
          typeVariant="inline"
          sizeVariant="xs"
          tabIndex={-1}
          className={
            buttonClassName ??
            'shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100'
          }
          onClick={(e) => {
            e.stopPropagation();
          }}
          data-row-action
          tooltip={labelTitle}
          shortcut="L"
          aria-label={labelTitle}
        >
          <MonoIcon type="Folder" size={18} weight={300} grade={0} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="w-56 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {t('thread_list.add_label', { defaultValue: 'Add label' })}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {userLabels.map((label) => {
            const applied = thread.labelIds?.includes(label.id) ?? false;
            return (
              <button
                key={label.id}
                type="button"
                tabIndex={-1}
                disabled={applied}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAdd(label.id, label.name);
                }}
              >
                <MonoIcon
                  type="Folder"
                  size={16}
                  weight={300}
                  grade={0}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate">{label.name.replace('Mono/', '')}</span>
                {applied && (
                  <MonoIcon type="Check" size={14} className="ml-auto text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});
LabelButton.displayName = 'LabelButton';
