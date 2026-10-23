import { isBackendConfigured } from '@/main/api/apiClient';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import SendFeedbackForm from '@/renderer/app/containers/help/SendFeedbackForm';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { getSupportEmail } from '@/renderer/app/lib/runtimeBranding';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface SendFeedbackDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

// getSupportEmail()'s fallback when no address is configured.
const PLACEHOLDER_SUPPORT_EMAIL = 'support@example.com';

// Feedback is posted to the Mono backend. Without one (the Gmail/Outlook-
// direct setup) the form could only fail after you'd typed it, so say so up
// front and point to the support address, through the app's own compose.
const FeedbackUnavailable: FC<{ onDone: () => void }> = ({ onDone }) => {
  const { t } = useTranslation();
  const { accounts } = useAuth();
  const executeCommand = useExecuteCommand();
  const support = getSupportEmail();
  const hasSupport = !!support && support !== PLACEHOLDER_SUPPORT_EMAIL;
  const account = accounts.find((a) => !a.isExpired) ?? accounts[0];

  return (
    <div className="space-y-4 p-6">
      <DialogHeader>
        <DialogTitle>{t('dialog.send_feedback.title')}</DialogTitle>
        <DialogDescription>
          {t('dialog.send_feedback.unavailable')}
          {hasSupport ? ' ' + t('dialog.send_feedback.unavailable_email') : ''}
        </DialogDescription>
      </DialogHeader>
      {hasSupport && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="select-text text-sm text-foreground">{support}</span>
          {account && (
            <Button
              variant="secondary"
              sizeVariant="sm"
              onClick={() => {
                onDone();
                executeCommand('COMPOSE_NEW_MESSAGE', {
                  draft: new MonoDraft({
                    from: account.email,
                    to: [support],
                    subject: t('dialog.send_feedback.email_subject')
                  })
                });
              }}
            >
              {t('dialog.send_feedback.write_email')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const SendFeedbackDialog: FC<SendFeedbackDialogProps> = ({ children, open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        {isBackendConfigured() ? (
          <DialogContent className="gap-0 p-0 dark:border sm:max-w-[800px]" aria-description="">
            <SendFeedbackForm
              onSubmit={(_) => {
                onOpenChange(false);
              }}
            />
          </DialogContent>
        ) : (
          <DialogContent className="gap-0 p-0 dark:border sm:max-w-[480px]">
            <FeedbackUnavailable onDone={() => onOpenChange(false)} />
          </DialogContent>
        )}
      </DialogPortal>
    </Dialog>
  );
};

export default SendFeedbackDialog;
