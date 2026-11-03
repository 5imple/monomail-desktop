import { forwardRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MonoIcon, { type InboxIconType } from '@/renderer/app/components/icons/InboxIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { cn } from '@/renderer/app/lib/utils';
import type { SchedulePreset } from '@/renderer/app/containers/queue/schedulePresets';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';
import { CustomDateTimePicker } from '@/renderer/app/containers/queue/CustomDateTimePicker';

export type QueueVariant = 'snoozed' | 'scheduled';

interface QueueRowProps {
  variant: QueueVariant;
  itemId: string;
  accountId: string;
  primaryName: string;
  primaryEmail: string;
  subject: string;
  snippet: string;
  timeLabel: string;
  isUrgent: boolean;
  isStarred?: boolean;
  attachmentCount?: number;

  reschedulePresets: SchedulePreset[];
  isRescheduling: boolean;

  onPrimaryAction?: () => void;
  /** Opens the email in the reader (snoozed rows). Without it the row opens nothing. */
  onOpen?: () => void;
  onCancel?: () => void;
  onOpenReschedule?: () => void;
  onCloseReschedule?: () => void;
  onPickReschedule?: (preset: SchedulePreset) => void;
}

// The inbox rows' hover-action button: neutral, 28px, the same icon set.
const ACTION_BUTTON_CLASS =
  'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function QueueRow({
  variant,
  accountId,
  primaryName,
  primaryEmail,
  subject,
  snippet,
  timeLabel,
  isUrgent,
  isStarred,
  attachmentCount,
  reschedulePresets,
  isRescheduling,
  onPrimaryAction,
  onOpen,
  onCancel,
  onOpenReschedule,
  onCloseReschedule,
  onPickReschedule
}: QueueRowProps) {
  const { t } = useTranslation();
  const primaryActionLabel =
    variant === 'snoozed' ? t('later.action.bring_back') : t('later.action.send_now');
  const primaryActionIcon: InboxIconType = variant === 'snoozed' ? 'RotateCcw' : 'Send';
  const rescheduleHeading =
    variant === 'snoozed'
      ? t('later.reschedule.snooze_heading')
      : t('later.reschedule.send_heading');
  // "Pick a date…" swaps the presets for the calendar (it used to be filtered
  // out, with nothing to pick from).
  const [customMode, setCustomMode] = useState(false);
  const rescheduleButtonRef = useRef<HTMLButtonElement>(null);

  return (
    // A snoozed row opens its email (click or Enter) without bringing it
    // back; it used to open nothing, so a snoozed email could not be read.
    // Scheduled rows have no onOpen and stay plain: their actions are the buttons.
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' && e.target === e.currentTarget) {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={cn(
        'group relative mx-[10%] rounded-md outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring pointer-hover:bg-foreground/[0.045] dark:pointer-hover:bg-foreground/[0.07]',
        onOpen && 'cursor-pointer',
        isRescheduling && 'bg-foreground/[0.045] dark:bg-foreground/[0.07]'
      )}
    >
      {/* Due within the hour */}
      {isUrgent && (
        <span
          aria-hidden
          className="absolute inset-y-[3px] left-0 w-[3px] rounded-r-full bg-secondary-accent"
        />
      )}

      <div className="flex items-center gap-4 px-3 py-2">
        <div className="flex w-44 shrink-0 items-center gap-2.5">
          <RecipientAvatar
            className="h-6 w-6 shrink-0"
            recipient={{ email: primaryEmail, name: primaryName }}
            accountId={accountId}
          />
          <span className="truncate text-[13px] font-medium text-foreground">{primaryName}</span>
        </div>

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="max-w-[42%] shrink-0 truncate text-[13px] font-medium text-foreground">
            {subject || t('header.display.no_subject')}
          </span>
          {/* No separator without a snippet (it was left dangling). */}
          {snippet && (
            <>
              <span aria-hidden className="hidden shrink-0 text-muted-foreground/40 sm:inline">
                –
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-[13px] text-muted-foreground sm:inline">
                {snippet}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isStarred && (
            <MonoIcon type="Star" fill size={14} weight={300} className="text-secondary-accent" />
          )}
          {attachmentCount !== undefined && attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground">
              <MonoIcon type="Paperclip" size={13} weight={300} />
              {attachmentCount}
            </span>
          )}

          {/* The time and the actions share one slot, as in the inbox: the
              time fades out and the actions fade in over it, so nothing beside
              them shifts on hover. */}
          <div className="relative flex min-w-[96px] items-center justify-end">
            <Popover
              open={isRescheduling}
              onOpenChange={(open) => {
                // Close-only: opening goes through onOpenReschedule.
                if (!open) {
                  setCustomMode(false);
                  onCloseReschedule?.();
                }
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  // Keyboard users reach Reschedule through the action bar;
                  // this label fades out whenever the bar shows.
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isRescheduling) onOpenReschedule?.();
                  }}
                  className={cn(
                    'whitespace-nowrap rounded text-right text-[12px] tabular-nums transition-opacity',
                    isUrgent ? 'font-medium text-foreground' : 'text-muted-foreground',
                    isRescheduling
                      ? 'text-foreground opacity-100'
                      : 'group-focus-within:opacity-0 group-pointer-hover:opacity-0'
                  )}
                  aria-label={t('later.action.reschedule_now', { time: timeLabel })}
                >
                  {timeLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-auto border-none bg-transparent p-0 shadow-none"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                // Back to a control that's visible: the time label is hidden
                // while the row has focus.
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  rescheduleButtonRef.current?.focus({ preventScroll: true });
                }}
              >
                {customMode ? (
                  <CustomDateTimePicker
                    heading={rescheduleHeading}
                    confirmLabel={t('later.action.reschedule')}
                    onBack={() => setCustomMode(false)}
                    onConfirm={(iso) => {
                      setCustomMode(false);
                      onPickReschedule?.({
                        id: 'custom',
                        labelKey: 'later.preset.custom',
                        scheduledFor: iso
                      });
                    }}
                  />
                ) : (
                  <ReschedulePopover
                    presets={reschedulePresets}
                    heading={rescheduleHeading}
                    onPickPreset={(preset) => onPickReschedule?.(preset)}
                    onPickCustom={() => setCustomMode(true)}
                  />
                )}
              </PopoverContent>
            </Popover>

            <div
              className={cn(
                'absolute right-0 flex items-center gap-0.5 transition-opacity',
                isRescheduling
                  ? 'pointer-events-none opacity-0'
                  : 'opacity-0 group-focus-within:opacity-100 group-pointer-hover:opacity-100'
              )}
            >
              <RowActionButton
                ref={rescheduleButtonRef}
                ariaLabel={t('later.action.reschedule')}
                icon="Clock"
                tabIndex={isRescheduling ? -1 : 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenReschedule?.();
                }}
              />
              <RowActionButton
                ariaLabel={primaryActionLabel}
                icon={primaryActionIcon}
                tabIndex={isRescheduling ? -1 : 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onPrimaryAction?.();
                }}
              />
              {/* Snoozed rows had a second, red X that did the same as Bring
                  back. Cancelling a scheduled send deletes it, so it keeps a
                  destructive cue. */}
              {variant === 'scheduled' && (
                <RowActionButton
                  ariaLabel={t('later.action.cancel_send')}
                  icon="X"
                  destructive
                  tabIndex={isRescheduling ? -1 : 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel?.();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RowActionButtonProps {
  ariaLabel: string;
  icon: InboxIconType;
  onClick: (e: React.MouseEvent) => void;
  destructive?: boolean;
  tabIndex?: number;
}

const RowActionButton = forwardRef<HTMLButtonElement, RowActionButtonProps>(
  ({ ariaLabel, icon, onClick, destructive = false, tabIndex }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      tabIndex={tabIndex}
      onClick={onClick}
      className={cn(
        ACTION_BUTTON_CLASS,
        destructive && 'hover:bg-destructive/10 hover:text-destructive'
      )}
    >
      <MonoIcon type={icon} size={18} weight={300} />
    </button>
  )
);
RowActionButton.displayName = 'RowActionButton';
