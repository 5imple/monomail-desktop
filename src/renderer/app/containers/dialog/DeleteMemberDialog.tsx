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
import { Alert, AlertDescription, AlertTitle } from '@/renderer/app/components/ui/alert';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
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
  const { billingInfo } = useBillingAtom();
  const { member, signOut, accounts } = useAuth();
  const { closeDialog } = useDialogs();
  const { exitWorker: exitHistoryWorker } = useSyncHistory();
  const { exitWorker: exitThreadWorker } = useSyncThread();
  const [loading, setLoading] = useState(false);

  const hasActiveSubscription = !!billingInfo.subscription && !billingInfo.subscription.cancelled;

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

  // Handle opening customer portal for subscription cancellation
  const handleOpenCustomerPortal = () => {
    if (!billingInfo.subscription) return;

    const baseUrl = `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/customer`;
    const params = new URLSearchParams();
    const userId = member?.primaryUid;
    if (userId && billingInfo.subscription) {
      params.append('uid', userId);
      params.append('type', 'portal');
      params.append('subscriptionId', billingInfo.subscription.id);
      window.open(`${baseUrl}?${params.toString()}`, '_blank');
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

          {hasActiveSubscription ? (
            <>
              <div className="flex">
                <Button onClick={handleOpenCustomerPortal} variant={'default'} className="ml-auto">
                  Cancel Subscription
                </Button>
              </div>
            </>
          ) : (
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant={'secondary'}>
                {t('dialog.delete_member.cancel')}
              </Button>
              <Button
                disabled={loading || hasActiveSubscription}
                onClick={onDeleteAccount}
                variant={'destructive'}
              >
                {loading && <Loader className="mr-2" />}
                {t('dialog.delete_member.confirm_delete')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default DeleteMemberDialog;
