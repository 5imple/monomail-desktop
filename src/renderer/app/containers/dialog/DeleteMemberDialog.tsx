import authApi from '@/main/api/auth/authApi';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import Loader from '@/renderer/app/components/ui/loader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';

import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
import { useSyncHistory } from '@/renderer/app/context/SyncHistoryContext';

interface DeleteMemberDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

const DeleteMemberDialog: FC<DeleteMemberDialogProps> = ({ children, open, onOpenChange }) => {
  const { t } = useTranslation();
  const { member, signOut } = useAuth();
  const { closeDialog } = useDialogs();
  const { exitWorker: exitHistoryWorker } = useSyncHistory();
  const { exitWorker: exitThreadWorker } = useSyncThread();
  const [loading, setLoading] = useState(false);

  const onDeleteAccount = async () => {
    if (!member) return;
    try {
      setLoading(true);
      await exitThreadWorker();
      await exitHistoryWorker();
      await signOut();
      await authApi.deleteUser();
      closeDialog('deleteAccount');
      closeDialog('preference');
      onOpenChange(false);
      setLoading(false);
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(t('toast.error.account_delete'));
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent aria-description="" className="dark:border sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="">{t('dialog.delete_member.title')}</DialogTitle>
            <DialogDescription className="">
              {t('dialog.delete_member.description')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} variant={'secondary'}>
              {t('dialog.delete_member.cancel')}
            </Button>
            <Button disabled={loading} onClick={onDeleteAccount} variant={'destructive'}>
              {loading && <Loader className="mr-2" />}
              {t('dialog.delete_member.confirm_delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default DeleteMemberDialog;
