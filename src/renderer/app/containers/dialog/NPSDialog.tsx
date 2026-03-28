import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import { NPSForm } from '@/renderer/app/containers/settings/forms/NPSForm';
import { NPSEventType } from '@/renderer/app/store/account/useNPSAtom';
import React, { FC } from 'react';

interface NPSDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  eventType: NPSEventType;
}

export const NPSDialog: FC<NPSDialogProps> = ({ children, open, onOpenChange, eventType }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent className="gap-0 p-0 dark:border sm:max-w-[600px]" aria-description="">
          <NPSForm
            eventType={eventType}
            onSubmit={(_) => {
              onOpenChange(false);
            }}
          />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};
