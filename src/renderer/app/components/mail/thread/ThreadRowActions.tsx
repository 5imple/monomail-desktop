import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { CustomDateTimePicker } from '@/renderer/app/containers/queue/CustomDateTimePicker';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';
import { buildSchedulePresets } from '@/renderer/app/containers/queue/schedulePresets';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import React, { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface ThreadActionButtonProps {
  thread: MonoThread;
  buttonClassName?: string;
}

export const SnoozeButton = React.memo<ThreadActionButtonProps>(({ thread, buttonClassName }) => {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const { snoozeThread } = useQueueAtom();
  const presets = useMemo(() => buildSchedulePresets(new Date()), [open]);

  const handlePickPreset = useCallback(
    async (preset: { id: string; scheduledFor: string | null }) => {
      if (!preset.scheduledFor) return;
      const sender = thread.from?.[0];
      const res = await snoozeThread({
        threadId: thread.id,
        accountId: thread.accountId,
        snoozeUntil: preset.scheduledFor,
        threadSnapshot: {
          subject: thread.subject || '(No subject)',
          snippet: thread.snippet || '',
          from: {
            id: sender?.email || thread.id,
            name: sender?.name || sender?.email || 'Unknown',
            email: sender?.email || ''
          },
          isStarred: thread.labelIds?.includes('STARRED') ?? false
        }
      });
      setOpen(false);
      if (!res.ok) {
        toast.error(`Couldn't snooze: ${res.error}`);
        return;
      }
      toast.success(`Snoozed until ${new Date(preset.scheduledFor).toLocaleString()}`);
    },
    [thread, snoozeThread]
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
          tooltip="Snooze"
          aria-label="Snooze"
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
            heading="Snooze until"
            confirmLabel="Snooze"
            onBack={() => setCustomMode(false)}
            onConfirm={(iso) => {
              setCustomMode(false);
              handlePickPreset({ id: 'custom', scheduledFor: iso });
            }}
          />
        ) : (
          <ReschedulePopover
            presets={presets}
            heading="Snooze until"
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
  const [open, setOpen] = useState(false);
  const { labelsMapByAccount } = useLabelAtom();
  const { addLabelToThread } = useThreadLabelAtom();

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
        toast.success(`Added label: ${labelName.replace('Mono/', '')}`);
      } catch {
        toast.error("Couldn't add label");
      }
    },
    [thread, addLabelToThread]
  );

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
          tooltip="Label"
          aria-label="Label"
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
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Add label</div>
        {userLabels.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No labels yet</div>
        ) : (
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
        )}
      </PopoverContent>
    </Popover>
  );
});
LabelButton.displayName = 'LabelButton';
