import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import SettingsLayout from '@/renderer/app/containers/settings/SettingsLayout';
import React, { FC } from 'react';

interface PreferanceDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  defaultPage?: string;
}

const PreferanceDialog: FC<PreferanceDialogProps> = ({
  children,
  open,
  onOpenChange,
  defaultPage = 'general'
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogTitle hidden />
        <DialogContent
          closeButton={false}
          aria-description=""
          className="gap-0 overflow-hidden p-0 dark:border sm:max-w-[1080px]"
        >
          <SettingsLayout defaultPage={defaultPage} />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default PreferanceDialog;
