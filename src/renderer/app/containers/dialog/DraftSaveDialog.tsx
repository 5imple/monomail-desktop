import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface DraftSaveDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave?: () => void;
  onDiscard?: () => void;
}

const DraftSaveDialog: FC<DraftSaveDialogProps> = ({
  children,
  open,
  onOpenChange,
  onSave,
  onDiscard
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogOverlay className="dark" />
      <DialogPortal>
        <DialogContent closeButton={false} className="max-w-[280px]" aria-description="">
          <DialogHeader className="text-center">
            <DialogTitle className="text-center">{t('dialog.draft_save.title')}</DialogTitle>
            <DialogDescription className="text-md text-center">
              {t('dialog.draft_save.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex w-full flex-col gap-2">
              <Button
                onClick={() => {
                  onSave && onSave();
                  onOpenChange(false);
                }}
                variant={'default'}
                className="w-full"
              >
                {t('dialog.draft_save.save_changes')}
              </Button>
              <Button
                onClick={() => {
                  onDiscard && onDiscard();
                  onOpenChange(false);
                }}
                variant={'secondary'}
                className="w-full"
              >
                {t('dialog.draft_save.dont_save')}
              </Button>
              <DialogClose asChild>
                <Button variant={'secondary'} className="mt-4 w-full">
                  {t('dialog.draft_save.cancel')}
                </Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default DraftSaveDialog;
