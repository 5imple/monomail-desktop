import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { CardFooter } from '@/renderer/app/components/ui/card';
import Loader from '@/renderer/app/components/ui/loader';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { ReschedulePopover } from '@/renderer/app/containers/queue/ReschedulePopover';
import { buildSchedulePresets } from '@/renderer/app/containers/queue/schedulePresets';
import { useQueueAtom } from '@/renderer/app/store/queue/useQueueAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface ComposeCardFooterProps {
  className?: string;
  draft: MonoDraft;
  handleSendMessage: () => Promise<void>;
  handleFileChange: (fileList: FileList | null) => Promise<void>;
  draftSaveStatus: 'INITIALIZED' | 'LOADING' | 'SAVED' | 'ERROR';
  sendDisabled: boolean;
  onDiscard: () => void;
}

const ComposeCardFooter: React.FC<ComposeCardFooterProps> = ({
  className,
  draft,
  handleSendMessage,
  handleFileChange,
  sendDisabled,
  onDiscard
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

  const handleSubmit = async () => {
    if (isCurrentAccountExpired) {
      toast.error(t('toast.error.account_expired'));
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

  const getAccountReconnectTooltip = useCallback(() => {
    return t('tooltips.account_status.authentication_expired');
  }, [t]);

  const getSendDisabledReason = useCallback(() => {
    if (isCurrentAccountExpired) return getAccountReconnectTooltip();
    if (draft.to.length === 0) return t('compose_card.footer.send_disabled.no_recipients');
    if (!draft.from) return t('compose_card.footer.send_disabled.no_sender');
    if (sendDisabled) return t('compose_card.footer.send_disabled.saving_draft');
    return t('compose_card.footer.send_now');
  }, [
    isCurrentAccountExpired,
    draft.to.length,
    draft.from,
    sendDisabled,
    getAccountReconnectTooltip,
    t
  ]);

  return (
    <div className={cn('no-drag', className)}>
      <CardFooter className="mx-9 flex h-[61px] items-center border-t-[0.5px] border-border/35 px-0 py-0">
        {/* Left: primary text actions */}
        <div className="flex items-center gap-5">
          <Button
            variant="text"
            className={cn(
              'px-0 text-[13px] font-semibold text-foreground hover:text-foreground/80',
              (sendDisabled || isSending || isCurrentAccountExpired) && 'text-muted-foreground'
            )}
            disabled={sendDisabled || isSending || isCurrentAccountExpired}
            onClick={handleSubmit}
            tooltip={getSendDisabledReason()}
            shortcut={
              !isCurrentAccountExpired && !sendDisabled && !isSending ? 'MOD+ENTER' : undefined
            }
          >
            {isSending && <Loader className="mr-1.5 h-3.5 w-3.5" />}
            {t('compose_card.footer.send_now')}
          </Button>

          <SendLaterButton
            draft={draft}
            disabled={sendDisabled || isSending || isCurrentAccountExpired || draft.to.length === 0}
          />
          <Button
            variant="text"
            sizeVariant="sm"
            disabled
            className="px-0 text-[13px] font-semibold text-muted-foreground/70 disabled:opacity-100"
          >
            Remind me
          </Button>
          <Button
            variant="text"
            sizeVariant="sm"
            disabled
            className="px-0 text-[13px] font-semibold text-muted-foreground/70 disabled:opacity-100"
          >
            Share draft
          </Button>
        </div>

        {/* Right: secondary icon actions */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Attachment */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                sizeVariant="sm"
                typeVariant="icon"
                className={cn(
                  'text-muted-foreground',
                  isCurrentAccountExpired && 'cursor-not-allowed text-muted-foreground/50'
                )}
                onClick={handleFileInputClick}
                disabled={isCurrentAccountExpired}
              >
                <MonoIcon type="Paperclip" className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('compose_card.footer.add_attachment')}</TooltipContent>
          </Tooltip>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileInputChange}
          />

          {/* Discard */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                sizeVariant="sm"
                typeVariant="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={onDiscard}
              >
                <MonoIcon type="Trash" className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('tooltip.discard')}</TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>
    </div>
  );
};

export default ComposeCardFooter;

function SendLaterButton({ draft, disabled }: { draft: MonoDraft; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const { scheduleDraft, primaryAccountId } = useQueueAtom();
  const { setActiveLayout } = useGlobalAtom();
  const { removeDraft } = useDraftAtom();
  const { getUidFromEmail } = useAuth();
  const presets = useMemo(() => buildSchedulePresets(new Date()), [open]);

  const handlePickPreset = useCallback(
    async (preset: { id: string; label: string; scheduledFor: string | null }) => {
      if (!preset.scheduledFor) return;
      const accountId = getUidFromEmail(draft.from) || primaryAccountId;
      if (!accountId) {
        toast.error('Could not determine sending account');
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
          subject: draft.subject || '(no subject)',
          bodySnippet: bodyPlain.slice(0, 160),
          recipients: draft.to.map((email) => ({ id: email, name: email, email })),
          attachmentCount: Object.keys(draft.attachments || {}).length,
          isReply: false
        }
      });
      setOpen(false);
      if (!res.ok) {
        toast.error(`Couldn't schedule send: ${res.error}`);
        return;
      }
      // Standalone: the raw message is now captured in the scheduler, so remove
      // the local draft (DB + attachment bytes + thread) — otherwise it lingers
      // in Drafts and could be opened and sent again manually (double-send).
      await removeDraft(res.resolvedUid, draft.id, false);
      setActiveLayout('LATER');
      toast.success(`Scheduled for ${new Date(preset.scheduledFor).toLocaleString()}`);
    },
    [draft, scheduleDraft, setActiveLayout, getUidFromEmail, primaryAccountId, removeDraft]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="text"
          sizeVariant="sm"
          disabled={disabled}
          tooltip="Send later"
          className="text-muted-foreground hover:text-foreground"
        >
          Send later
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-auto border-none bg-transparent p-0 shadow-none"
      >
        <ReschedulePopover
          presets={presets}
          heading="Send Later"
          onPickPreset={handlePickPreset}
          onPickCustom={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
