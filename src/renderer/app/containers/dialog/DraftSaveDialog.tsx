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
  /** Never saved before compose opened: the destructive choice deletes it. */
  isNewDraft?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}

// Drafts autosave, so this asks what to keep — not whether to save. For an
// existing draft the destructive choice puts it back the way it was; for a
// new compose it deletes the draft.
const DraftSaveDialog: FC<DraftSaveDialogProps> = ({
  children,
  open,
  onOpenChange,
  isNewDraft,
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
            <DialogTitle className="text-center">
              {isNewDraft ? t('dialog.draft_save.new_title') : t('dialog.draft_save.title')}
            </DialogTitle>
            <DialogDescription className="text-center text-sm">
              {isNewDraft
                ? t('dialog.draft_save.new_description')
                : t('dialog.draft_save.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex w-full flex-col gap-2">
              <Button
                onClick={() => {
                  onSave?.();
                  onOpenChange(false);
                }}
                variant={'default'}
                className="w-full"
              >
                {isNewDraft
                  ? t('dialog.draft_save.keep_draft')
                  : t('dialog.draft_save.save_changes')}
              </Button>
              <Button
                onClick={() => {
                  onDiscard?.();
                  onOpenChange(false);
                }}
                variant={'destructive'}
                className="w-full"
              >
                {isNewDraft
                  ? t('dialog.draft_save.delete_draft')
                  : t('dialog.draft_save.dont_save')}
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
