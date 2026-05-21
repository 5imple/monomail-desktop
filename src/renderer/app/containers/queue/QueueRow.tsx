import { Clock, Paperclip, RotateCcw, Send, Star, X } from 'lucide-react';
import { cn } from '@/renderer/app/lib/utils';
import type { SchedulePreset } from '@/renderer/app/containers/queue/schedulePresets';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';

const AVATAR_HUES = [
  'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
] as const;

function hueFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export type QueueVariant = 'snoozed' | 'scheduled';

interface QueueRowProps {
  variant: QueueVariant;
  itemId: string;
  primaryName: string;
  primaryHueId: string;
  primaryInitials: string;
  subject: string;
  snippet: string;
  timeLabel: string;
  isUrgent: boolean;
  isStarred?: boolean;
  attachmentCount?: number;

  reschedulePresets: SchedulePreset[];
  isRescheduling: boolean;

  onOpen?: () => void;
  onPrimaryAction?: () => void;
  onCancel?: () => void;
  onClickTime?: () => void;
  onCloseReschedule?: () => void;
  onPickReschedule?: (preset: SchedulePreset) => void;
  onPickCustomReschedule?: () => void;
}

export function QueueRow({
  variant,
  primaryName,
  primaryHueId,
  primaryInitials,
  subject,
  snippet,
  timeLabel,
  isUrgent,
  isStarred,
  attachmentCount,
  reschedulePresets,
  isRescheduling,
  onOpen,
  onPrimaryAction,
  onCancel,
  onClickTime,
  onCloseReschedule,
  onPickReschedule,
  onPickCustomReschedule
}: QueueRowProps) {
  const primaryActionLabel = variant === 'snoozed' ? 'Bring back now' : 'Send now';
  const PrimaryActionIcon = variant === 'snoozed' ? RotateCcw : Send;

  return (
    <div className="group relative">
      {isUrgent && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] bg-amber-400 dark:bg-amber-500"
        />
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpen?.();
        }}
        className="flex cursor-pointer items-center gap-6 bg-background px-8 py-3.5 transition-colors hover:bg-muted/40 sm:px-12"
      >
        <div className="flex w-44 shrink-0 items-center gap-2.5">
          <span
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tracking-tight',
              hueFor(primaryHueId)
            )}
            aria-hidden
          >
            {primaryInitials}
          </span>
          <span className="truncate text-[14px] font-medium tracking-tight text-foreground">
            {primaryName}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="shrink-0 max-w-[42%] truncate text-[14px] font-semibold tracking-tight text-foreground">
            {subject}
          </span>
          <span aria-hidden className="shrink-0 text-stone-300 dark:text-stone-700">
            ·
          </span>
          <span className="hidden min-w-0 flex-1 truncate text-[13px] tracking-tight text-muted-foreground sm:inline">
            {snippet}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isStarred && (
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={1.5} />
          )}
          {attachmentCount !== undefined && attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
              <Paperclip className="h-3 w-3" strokeWidth={1.75} />
              {attachmentCount}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClickTime?.();
            }}
            className={cn(
              'group/time relative inline-flex items-center gap-1 rounded text-right text-[12px] tracking-tight tabular-nums transition-colors',
              isUrgent
                ? 'font-medium text-amber-600 dark:text-amber-400'
                : 'text-muted-foreground',
              !isRescheduling && 'group-hover:hidden',
              isRescheduling && 'text-foreground'
            )}
            aria-label="Reschedule"
          >
            <Clock
              className="h-3 w-3 opacity-0 transition-opacity group-hover/time:opacity-100"
              strokeWidth={1.75}
            />
            {timeLabel}
          </button>

          {!isRescheduling && (
            <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
              <RowActionButton
                ariaLabel="Reschedule"
                icon={Clock}
                onClick={(e) => {
                  e.stopPropagation();
                  onClickTime?.();
                }}
              />
              <RowActionButton
                ariaLabel={primaryActionLabel}
                icon={PrimaryActionIcon}
                onClick={(e) => {
                  e.stopPropagation();
                  onPrimaryAction?.();
                }}
                accent="primary"
              />
              <RowActionButton
                ariaLabel="Cancel"
                icon={X}
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel?.();
                }}
                accent="danger"
              />
            </div>
          )}
        </div>
      </div>

      {isRescheduling && (
        <>
          <button
            type="button"
            aria-label="Close reschedule popover"
            onClick={onCloseReschedule}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-8 top-full z-20 mt-1 sm:right-12">
            <ReschedulePopover
              presets={reschedulePresets}
              heading={variant === 'snoozed' ? 'Reschedule snooze' : 'Reschedule send'}
              onPickPreset={(preset) => {
                onPickReschedule?.(preset);
              }}
              onPickCustom={() => {
                onPickCustomReschedule?.();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

interface RowActionButtonProps {
  ariaLabel: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick: (e: React.MouseEvent) => void;
  accent?: 'neutral' | 'primary' | 'danger';
}

function RowActionButton({
  ariaLabel,
  icon: Icon,
  onClick,
  accent = 'neutral'
}: RowActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
        accent === 'primary'
          ? 'text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300'
          : accent === 'danger'
            ? 'text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}
