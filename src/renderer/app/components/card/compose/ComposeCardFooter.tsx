import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { CardFooter } from '@/renderer/app/components/ui/card';
import Loader from '@/renderer/app/components/ui/loader';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { CustomDateTimePicker } from '@/renderer/app/containers/queue/CustomDateTimePicker';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';
import { buildSchedulePresets } from '@/renderer/app/containers/queue/schedulePresets';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isBackendConfigured } from '@/main/api/apiClient';

interface ComposeCardFooterProps {
  className?: string;
  draft: MonoDraft;
  /** Autosave state ("Saving" / "Save failed"), shown where it can't push anything. */
  draftStatus?: React.ReactNode;
  handleSendMessage: () => Promise<void>;
  handleFileChange: (fileList: FileList | null) => Promise<void>;
  /** Why Send can't go right now; null when it can. */
  sendBlockedReason: string | null;
  /** Feedback for a click on a blocked Send / Send later. */
  onSendBlocked: () => void;
  /** Send later scheduled the draft: the queue owns it now. */
  onScheduled: () => void;
  onDiscard: () => void;
  trackingEnabled: boolean;
  onToggleTracking: () => void;
}

const ICON_BUTTON_CLASS = 'text-muted-foreground hover:text-foreground';

const ComposeCardFooter: React.FC<ComposeCardFooterProps> = ({
  className,
  draft,
  draftStatus,
  handleSendMessage,
  handleFileChange,
  sendBlockedReason,
  onSendBlocked,
  onScheduled,
  onDiscard,
  trackingEnabled,
  onToggleTracking
}) => {
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentAccount = useMemo(() => {
    if (!draft.from) return null;
    return accounts.find((account) => account.email === draft.from) ?? null;
  }, [accounts, draft.from]);

  const isCurrentAccountExpired = useMemo(() => {
    return currentAccount?.isExpired ?? false;
  }, [currentAccount]);

  const blocked = !!sendBlockedReason;

  // A blocked Send stays hoverable and focusable (aria-disabled, not
  // disabled) so its tooltip can say why; a click explains instead of
  // doing nothing.
  const handleSubmit = async () => {
    if (isSending) return;
    if (blocked) {
      onSendBlocked();
      return;
    }
    setIsSending(true);
    try {
      await handleSendMessage();
    } catch (error) {
      console.error('Error sending mail:', error);
      toast.error(t('toast.error.send_mail'));
    }
    setIsSending(false);
  };

  const handleFileInputClick = () => {
    if (isCurrentAccountExpired) {
      toast.error(t('toast.error.account_expired'));
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCurrentAccountExpired) {
      toast.error(t('toast.error.account_expired'));
      return;
    }
    try {
      await handleFileChange(e.target.files);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={cn('no-drag', className)}>
      <CardFooter className="mx-9 flex h-[61px] items-center border-t border-border px-0 py-0">
        {/* Left: Send, the one filled button in the card, then Send later. It
            was a line of plain text next to "Send later" and read as a label. */}
        <div className="flex items-center gap-4">
          <Button
            variant="default"
            sizeVariant="sm"
            className={cn(
              'h-8 gap-1.5 rounded-md px-3.5 text-[13px] font-semibold',
              (blocked || isSending) && 'cursor-not-allowed opacity-60'
            )}
            aria-disabled={blocked || isSending}
            onClick={handleSubmit}
            tooltip={sendBlockedReason ?? t('compose_card.footer.send_now')}
            shortcut={!blocked && !isSending ? 'MOD+ENTER' : undefined}
          >
            {isSending ? (
              <Loader className="h-3.5 w-3.5 text-primary-foreground" />
            ) : (
              <MonoIcon type="Send" className="h-3.5 w-3.5" />
            )}
            {t('compose_card.footer.send_now')}
          </Button>

          {/* Scheduling is a backend endpoint (queueApi); without one every
              pick failed with "requires a backend" after the user chose a time. */}
          {isBackendConfigured() && (
            <SendLaterButton
              draft={draft}
              blockedReason={isSending ? t('compose_card.footer.sending') : sendBlockedReason}
              onBlocked={onSendBlocked}
              onScheduled={onScheduled}
            />
          )}
        </div>

        {/* Right: secondary icon actions */}
        <div className="ml-auto flex items-center gap-0.5">
          {draftStatus && <div className="mr-2">{draftStatus}</div>}

          {/* Attachment */}
          <Button
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className={cn(
              ICON_BUTTON_CLASS,
              isCurrentAccountExpired && 'cursor-not-allowed text-muted-foreground/50'
            )}
            aria-disabled={isCurrentAccountExpired}
            onClick={handleFileInputClick}
            tooltip={t('compose_card.footer.add_attachment')}
          >
            <MonoIcon type="Paperclip" className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileInputChange}
          />

          {/* Read-tracking toggle — off by default; nothing else in compose
              discloses that this exists, so it needs to be visible here.
              Tracking needs the optional backend, so without one the toggle
              would promise open notifications that can never arrive. */}
          {isBackendConfigured() && (
            <Button
              variant="ghost"
              sizeVariant="sm"
              typeVariant="icon"
              aria-pressed={trackingEnabled}
              className={cn(
                // text-accent is the near-white neutral token — invisible here.
                trackingEnabled ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={onToggleTracking}
              tooltip={
                trackingEnabled
                  ? t('compose_card.footer.tracking_on')
                  : t('compose_card.footer.tracking_off')
              }
            >
              <MonoIcon type={trackingEnabled ? 'Eye' : 'EyeSlash'} className="h-4 w-4" />
            </Button>
          )}

          {/* Discard — set apart from the attach / tracking icons. */}
          <div aria-hidden className="mx-1.5 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            sizeVariant="sm"
            typeVariant="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={onDiscard}
            tooltip={t('tooltip.discard_draft')}
          >
            <MonoIcon type="Trash" className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </div>
  );
};

export default ComposeCardFooter;

function SendLaterButton({
  draft,
  blockedReason,
  onBlocked,
  onScheduled
}: {
  draft: MonoDraft;
  blockedReason: string | null;
  onBlocked: () => void;
  onScheduled: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const { scheduleDraft, primaryAccountId } = useQueueAtom();
  const { setActiveLayout } = useGlobalAtom();
  const { removeDraft } = useDraftAtom();
  const { getUidFromEmail } = useAuth();
  const presets = useMemo(() => buildSchedulePresets(new Date()), [open]);
  const blocked = !!blockedReason;

  const handlePickPreset = useCallback(
    async (preset: { id: string; scheduledFor: string | null }) => {
      if (!preset.scheduledFor) return;
      const fromUid = getUidFromEmail(draft.from);
      const accountId = fromUid || primaryAccountId;
      if (!accountId) {
        toast.error(t('toast.compose.no_sending_account'));
        return;
      }
      const bodyPlain = (draft.body || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const res = await scheduleDraft({
        draftId: draft.id,
        accountId,
        sendAt: preset.scheduledFor,
        draftSnapshot: {
          subject: draft.subject || '',
          bodySnippet: bodyPlain.slice(0, 160),
          recipients: draft.to.map((email) => ({ id: email, name: email, email })),
          attachmentCount: Object.keys(draft.attachments || {}).length,
          isReply: false
        }
      });
      setOpen(false);
      if (!res.ok) {
        toast.error(t('toast.compose.schedule_failed', { error: res.error }));
        return;
      }
      // Close compose first: left open, a pending autosave or "Save" on close
      // wrote the scheduled draft back to Drafts (a second, manual send).
      onScheduled();
      // The schedule is now owned by the queue (backend or local scheduler), so
      // remove the local draft (DB + attachment bytes + thread) — otherwise it
      // lingers in Drafts and could be opened and sent again manually
      // (double-send). Drafts are stored under their from-uid in a per-uid DB;
      // the primaryAccountId fallback would open the wrong DB and silently
      // no-op, so only clean up when the from-uid actually resolved.
      if (fromUid) {
        await removeDraft(fromUid, draft.id, false);
      } else {
        toast(t('toast.compose.scheduled_draft_not_removed'));
      }
      // Stay where you were (the reader you replied from); Later is one click.
      toast.success(
        t('toast.compose.scheduled', {
          time: new Date(preset.scheduledFor).toLocaleString()
        }),
        {
          action: {
            label: t('toast.compose.view_scheduled'),
            onClick: () => setActiveLayout('LATER')
          }
        }
      );
    },
    [
      draft,
      scheduleDraft,
      setActiveLayout,
      getUidFromEmail,
      primaryAccountId,
      removeDraft,
      onScheduled,
      t
    ]
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // Blocked: explain instead of opening a picker that can't schedule.
        if (o && blocked) {
          onBlocked();
          return;
        }
        setOpen(o);
        if (!o) setCustomMode(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="text"
          sizeVariant="sm"
          aria-disabled={blocked}
          tooltip={blockedReason ?? undefined}
          className={cn(
            'text-muted-foreground hover:text-foreground',
            blocked && 'cursor-not-allowed hover:text-muted-foreground'
          )}
        >
          {t('compose_card.footer.send_later')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-auto border-none bg-transparent p-0 shadow-none"
      >
        {customMode ? (
          <CustomDateTimePicker
            heading={t('compose_card.footer.send_later')}
            confirmLabel={t('compose_card.footer.schedule')}
            onBack={() => setCustomMode(false)}
            onConfirm={(iso) => {
              setCustomMode(false);
              handlePickPreset({ id: 'custom', scheduledFor: iso });
            }}
          />
        ) : (
          <ReschedulePopover
            presets={presets}
            heading={t('compose_card.footer.send_later')}
            onPickPreset={handlePickPreset}
            onPickCustom={() => setCustomMode(true)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
