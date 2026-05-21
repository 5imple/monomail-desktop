import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { CardFooter } from '@/renderer/app/components/ui/card';
import Loader from '@/renderer/app/components/ui/loader';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';

import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { Switch } from '@/renderer/app/components/ui/switch';

interface ComposeCardFooterProps {
  className?: string;
  draft: MonoDraft;
  handleSendMessage: () => Promise<void>;
  onFromChange: (email: string, uid: string) => void;
  handleFileChange: (fileList: FileList | null) => Promise<void>;
  handleAiButtonClick: () => void;
  trackingEnabled: boolean;
  onTrackingChange: (enabled: boolean) => void;
  draftSaveStatus: 'INITIALIZED' | 'LOADING' | 'SAVED' | 'ERROR';
  sendDisabled: boolean;
}

const ComposeCardFooter: React.FC<ComposeCardFooterProps> = ({
  className,
  draft,
  handleSendMessage,
  handleFileChange,
  handleAiButtonClick,
  trackingEnabled,
  onTrackingChange,
  sendDisabled,
  onFromChange
}) => {
  const { t } = useTranslation();
  const { hasProAccess, getUserPlan } = useBillingAtom();
  const { accounts, getUidFromEmail, getAccountByUid } = useAuth();
  const { openDialog } = useDialogs();
  const [from, setFrom] = useState(draft.from);

  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current account is expired
  const currentAccount = useMemo(() => {
    if (!draft.from) return null;
    const uid = getUidFromEmail(draft.from);
    return uid ? getAccountByUid(uid) : null;
  }, [draft.from, getUidFromEmail, getAccountByUid]);

  const isCurrentAccountExpired = useMemo(() => {
    return currentAccount?.isExpired ?? false;
  }, [currentAccount]);

  // Filter accounts to only show non-expired ones in the dropdown
  const availableAccounts = useMemo(() => {
    return accounts.filter((account) => !account.isExpired);
  }, [accounts]);

  // Check if user has pro plan for AI features
  const handleAiAction = useCallback(() => {
    if (isCurrentAccountExpired) {
      // Open preferences to reconnect account
      openDialog('preference', { defaultPage: 'integration' });
      return;
    }

    if (!hasProAccess) {
      // Open billing page if user doesn't have pro access
      openDialog('preference', { defaultPage: 'billing' });
      return;
    }
    handleAiButtonClick();
  }, [hasProAccess, isCurrentAccountExpired, openDialog, handleAiButtonClick]);

  const handleTrackingToggle = useCallback(
    (checked: boolean) => {
      if (isCurrentAccountExpired) {
        openDialog('preference', { defaultPage: 'integration' });
        return;
      }

      if (getUserPlan() !== 'plus' && getUserPlan() !== 'plus_onetime' && getUserPlan() !== 'pro') {
        // Open billing page if user doesn't have pro access
        openDialog('preference', { defaultPage: 'billing' });
        return;
      }

      onTrackingChange(checked);
    },
    [isCurrentAccountExpired, openDialog, hasProAccess, onTrackingChange]
  );
  // Handle form submission
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

  // Modified function to reset file input value after handling files
  const handleFileInputClick = () => {
    if (isCurrentAccountExpired) {
      toast.error(t('toast.error.account_expired'));
      return;
    }
    fileInputRef.current?.click();
  };

  // Handle file change with reset
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCurrentAccountExpired) {
      toast.error(t('toast.error.account_expired'));
      return;
    }

    try {
      await handleFileChange(e.target.files);
    } finally {
      // Reset the file input value to ensure onChange fires even with the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useHotkeys('MOD+J', handleAiAction, { preventDefault: true, scopes: ['GLOBAL_COMPOSE'] }, [
    handleAiAction,
    hasProAccess,
    isCurrentAccountExpired
  ]);

  const getAccountReconnectTooltip = useCallback(() => {
    return t('tooltips.account_status.authentication_expired');
  }, [t]);

  // Function to get the disabled reason for the send button
  const getSendDisabledReason = useCallback(() => {
    if (isCurrentAccountExpired) {
      return getAccountReconnectTooltip();
    }
    if (draft.to.length === 0) {
      return t('compose_card.footer.send_disabled.no_recipients');
    }
    if (!draft.from) {
      return t('compose_card.footer.send_disabled.no_sender');
    }
    if (sendDisabled) {
      // This covers draftSaveStatus === 'LOADING'
      return t('compose_card.footer.send_disabled.saving_draft');
    }
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
      {/* Valid Attachments */}

      {/* Footer Actions */}
      <CardFooter className="flex items-center gap-3 border-t border-border/40 p-2">
        <div className="flex items-center">
          <Button
            className={cn(
              'text-muted-foreground',
              isCurrentAccountExpired && 'cursor-not-allowed text-muted-foreground/50'
            )}
            variant="ghost"
            typeVariant="icon"
            tooltip={
              isCurrentAccountExpired
                ? getAccountReconnectTooltip()
                : t('compose_card.footer.add_attachment')
            }
            onClick={handleFileInputClick}
            disabled={isCurrentAccountExpired}
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
          {/* <TemplateSwitcher onTemplateChange={onTemplateChange}>
            <Button
              variant="ghost"
              typeVariant="icon"
              tooltip={t('compose_card.footer.use_template')}
            >
              <MonoIcon type="ScrollText" className="h-4 w-4" />
            </Button>
          </TemplateSwitcher> */}
          {/* {(billingInfo.subscriptions.length > 0 || import.meta.env.DEV) && ( */}
          <Button
            className={cn(
              isCurrentAccountExpired
                ? 'cursor-not-allowed text-muted-foreground/50'
                : hasProAccess
                  ? // AI affordance uses amber (secondary-accent) so red
                    // stays reserved for primary actions.
                    'text-muted-foreground hover:text-[hsl(var(--secondary-accent))]'
                  : 'cursor-not-allowed text-muted-foreground/50'
            )}
            onClick={handleAiAction}
            variant="ghost"
            typeVariant="icon"
            shortcut={'MOD+J'}
            tooltip={
              isCurrentAccountExpired
                ? getAccountReconnectTooltip()
                : hasProAccess
                  ? t('compose_card.footer.mono_ai')
                  : t('settings.billing.upgrade_required')
            }
            disabled={false} // Keep enabled to allow clicking for various redirects
          >
            <MonoIcon type="Sparkles" />
          </Button>

          <div className="ml-1">
            <Tooltip>
              <TooltipTrigger className="flex items-center gap-2">
                <Switch
                  size="sm"
                  checked={trackingEnabled}
                  onCheckedChange={handleTrackingToggle}
                  disabled={
                    isCurrentAccountExpired ||
                    !(
                      getUserPlan() === 'plus' ||
                      getUserPlan() === 'plus_onetime' ||
                      getUserPlan() === 'pro'
                    )
                  }
                />
                <MonoIcon
                  type="CheckCheck"
                  className={cn(
                    'h-4 w-4',
                    isCurrentAccountExpired
                      ? 'text-muted-foreground/50'
                      : getUserPlan() === 'plus' ||
                          getUserPlan() === 'plus_onetime' ||
                          getUserPlan() === 'pro'
                        ? trackingEnabled
                          ? 'text-accent'
                          : 'text-muted-foreground'
                        : 'text-muted-foreground/50'
                  )}
                />
              </TooltipTrigger>
              <TooltipContent>{t('compose_card.footer.use_tracker')}</TooltipContent>
            </Tooltip>
          </div>
          {/* )} */}
        </div>
        <div className="ml-auto flex gap-2">
          <div className="flex w-full items-center justify-end gap-2">
            <Select
              defaultValue={draft.from}
              onValueChange={(email) => {
                const uid = getUidFromEmail(email);
                setFrom(email);
                if (uid) onFromChange(email, uid);
              }}
            >
              <Tooltip>
                <TooltipTrigger>
                  <SelectTrigger variant={'secondary'} className="w-[180px]">
                    <SelectValue placeholder={from}>
                      <div className="flex items-center gap-1">
                        {isCurrentAccountExpired && (
                          <MonoIcon type="AlertCircle" className="shrink-0 text-destructive" />
                        )}
                        <div className="overflow-hidden text-ellipsis">
                          <span className="whitespace-nowrap">{from}</span>
                        </div>
                      </div>
                    </SelectValue>
                  </SelectTrigger>{' '}
                </TooltipTrigger>
                {isCurrentAccountExpired && (
                  <TooltipContent>
                    {t('tooltips.account_status.authentication_expired')}
                  </TooltipContent>
                )}
              </Tooltip>
              <SelectContent className="dark">
                <SelectGroup>
                  {availableAccounts.map((account) => (
                    <SelectItem key={account.email} value={account.email}>
                      {account.email}
                    </SelectItem>
                  ))}
                  {/* Show expired accounts but disabled */}
                  {accounts
                    .filter((account) => account.isExpired)
                    .map((account) => (
                      <SelectItem key={account.email} value={account.email} disabled>
                        <div className="flex w-full items-center justify-between">
                          <span className="opacity-50">{account.email}</span>
                          <MonoIcon type="AlertCircle" className="ml-1 h-3 w-3 text-destructive" />
                        </div>
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <div className={cn('flex items-center')}>
              <Button
                disabled={sendDisabled || isSending || isCurrentAccountExpired}
                onClick={handleSubmit}
                tooltip={getSendDisabledReason()}
                shortcut={
                  !isCurrentAccountExpired && !sendDisabled && !isSending ? 'MOD+ENTER' : undefined
                }
                className="flex border-none disabled:pointer-events-auto"
              >
                {isSending ? (
                  <Loader className="mr-2" />
                ) : (
                  <MonoIcon type="Send" className="mr-2 mt-0.5 h-4 w-4" />
                )}
                {t('compose_card.footer.send_now')}
              </Button>
            </div>
          </div>
        </div>
      </CardFooter>
    </div>
  );
};

export default ComposeCardFooter;
