import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  AlertDialog,
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
import { closeDB, initDB } from '@/renderer/app/lib/db/db';
import { clearOutlookWatermark } from '@/renderer/app/lib/db/outlookWatermark';
import { clearLabelsCache } from '@/renderer/app/store/label/useLabelAtom';
import { clearSpaceCache } from '@/renderer/app/store/space/useSpaceAtom';

// What a resync rebuilds. Drafts, their attachments and contacts (pinned ones
// too) live in the same database and exist nowhere else, so the reset no
// longer deletes the whole database: that silently threw away unsent drafts.
const CACHE_STORES = ['threads', 'messages', 'syncHistoryMeta'] as const;

// deleteDatabase reports through events. A connection still open elsewhere
// (a sync worker) makes it "blocked", so never wait on it indefinitely.
const deleteDatabase = (name: string) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 3000);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = done;
    request.onerror = done;
    request.onblocked = done;
  });

export function ResetCacheButton() {
  const { t } = useTranslation();
  const { accounts } = useAuth();

  const [isResetting, setIsResetting] = useState(false);

  const resetCache = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      // Process each account sequentially
      for (const account of accounts) {
        try {
          const db = await initDB(account.uid);
          const tx = db.transaction([...CACHE_STORES], 'readwrite');
          await Promise.all([...CACHE_STORES.map((name) => tx.objectStore(name).clear()), tx.done]);
        } catch (error) {
          // An old or damaged database: fall back to deleting it whole, so the
          // reset still works as a recovery tool.
          console.error(`Couldn't clear the cache for account ${account.uid}:`, error);
          await closeDB(account.uid);
          await deleteDatabase(`mono-db-${account.uid}`);
        }
        // Outlook's sync position is kept outside that database; without
        // clearing it the next sync would only fetch changes since then.
        if (account.provider === 'microsoft') {
          await clearOutlookWatermark(account.uid);
        }
      }
      await clearSpaceCache();
      await clearLabelsCache();

      // Reload only after every account's cache has actually been cleared —
      // this used to sit inside the loop above and reload after the first
      // account, silently leaving every other account's cache untouched.
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset thread cache:', error);
      toast.error(t('settings.system.cache.reset_error'));
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
        <AlertDialogContent
          // Stays up until the reload; Escape mid-reset would hide the progress.
          onEscapeKeyDown={(e) => {
            if (isResetting) e.preventDefault();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">
              {t('settings.system.cache.reset_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.system.cache.reset_confirm_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>
              {t('settings.buttons.cancel')}
            </AlertDialogCancel>
            {/* A plain button, not AlertDialogAction: the action closed the dialog
                on click, so "Resetting…" never showed. */}
            <Button type="button" variant="destructive" onClick={resetCache} disabled={isResetting}>
              {isResetting && (
                <MonoIcon type="Loader2" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {isResetting
                ? t('settings.system.cache.resetting')
                : t('settings.system.cache.reset_confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
