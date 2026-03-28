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
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import { DialogTitle } from '@radix-ui/react-dialog';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface DraftDiscardDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSave?: () => void;
  onDiscard?: () => void;
}

const DraftDiscardDialog: FC<DraftDiscardDialogProps> = ({
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
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {t('dialog.draft_discard.title')}
            </DialogTitle>
            <DialogDescription className="text-md">
              {t('dialog.draft_discard.description')}
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
                {t('dialog.draft_discard.keep_draft')}
              </Button>
              <Button
                onClick={() => {
                  onDiscard && onDiscard();
                  onOpenChange(false);
                }}
                variant={'secondary'}
                className="w-full"
              >
                {t('dialog.draft_discard.delete')}
              </Button>
              <DialogClose asChild>
                <Button variant={'secondary'} className="mt-4 w-full">
                  {t('dialog.draft_discard.cancel')}
                </Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default DraftDiscardDialog;
