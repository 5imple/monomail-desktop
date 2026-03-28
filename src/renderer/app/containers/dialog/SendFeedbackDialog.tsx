import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import SendFeedbackForm from '@/renderer/app/containers/help/SendFeedbackForm';
import React, { FC } from 'react';

interface SendFeedbackDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const SendFeedbackDialog: FC<SendFeedbackDialogProps> = ({ children, open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent className="gap-0 p-0 dark:border sm:max-w-[800px]" aria-description="">
          <SendFeedbackForm
            onSubmit={(_) => {
              onOpenChange(false);
            }}
          />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default SendFeedbackDialog;
