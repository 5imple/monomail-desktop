import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/renderer/app/components/ui/alert-dialog';
import { Button } from '@/renderer/app/components/ui/button';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { closeDB } from '@/renderer/app/lib/db/db';
import { clearLabelsCache } from '@/renderer/app/store/label/useLabelAtom';
import { clearSpaceCache } from '@/renderer/app/store/space/useSpaceAtom';

export function ResetCacheButton() {
  const { t } = useTranslation();
  const { accounts } = useAuth();

  const [isResetting, setIsResetting] = useState(false);

  const resetCache = async () => {
    try {
      setIsResetting(true);

      // Process each account sequentially
      for (const account of accounts) {
        try {
          // Close any open database connection first
          await closeDB(account.uid);

          // Delete the database
          await window.indexedDB.deleteDatabase(`mono-db-${account.uid}`);
          await clearSpaceCache();
          await clearLabelsCache();

          window.location.reload();
          console.log(`Reset cache for account: ${account.uid}`);
        } catch (error) {
          console.error(`Failed to reset thread cache for account ${account.uid}:`, error);
          // Continue with other accounts even if one fails
        }
      }

      toast.success(t('settings.system.cache.reset_success'));
    } catch (error) {
      console.error('Failed to reset thread cache:', error);
      toast.error(t('settings.system.cache.reset_error'));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" className="gap-2">
          <MonoIcon type="Trash" className="h-4 w-4" />
          {t('settings.system.cache.reset_button')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogPortal>
        <AlertDialogOverlay className="dark" />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">
              {t('settings.system.cache.reset_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.system.cache.reset_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('settings.buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={resetCache}
              disabled={isResetting}
              // className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting
                ? t('settings.system.cache.resetting')
                : t('settings.system.cache.reset_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
