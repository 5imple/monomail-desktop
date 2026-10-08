import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { generateUUID } from '@/main/utils';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import {
  DBGetAttachmentsForDraft,
  DBSaveAttachmentBlob
} from '@/renderer/app/lib/db/draftAttachment';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const UNDO_WINDOW_MS = 6000;

/**
 * Discards a draft behind a "Draft discarded · Undo" toast (plain Z works
 * too) instead of deleting it outright. removeDraft also deletes the
 * attachment bytes, so they're read first and written back on Undo — the
 * draft returns complete. `reopen` puts it back in a compose window (the
 * compose trash); without it the draft just reappears in its thread.
 */
export function useDiscardDraftWithUndo() {
  const { t } = useTranslation();
  const { removeDraft, updateDraft } = useDraftAtom();
  const { addUndoAction } = useUndoManager();
  const executeCommand = useExecuteCommand();

  return useCallback(
    async (uid: string, draft: MonoDraft, { reopen }: { reopen: boolean }) => {
      const snapshot = new MonoDraft(draft.toPlainObject());
      const blobs = await DBGetAttachmentsForDraft(uid, draft.id).catch(() => []);
      await removeDraft(uid, draft.id);

      const toastId = generateUUID();
      let restored = false;
      const restore = async () => {
        if (restored) return;
        restored = true;
        toast.dismiss(toastId);
        try {
          await Promise.all(blobs.map((record) => DBSaveAttachmentBlob(uid, record)));
          await updateDraft(uid, snapshot, true, true);
          if (reopen) executeCommand('COMPOSE_NEW_MESSAGE', { draft: snapshot });
        } catch (error) {
          console.error('[discardDraft] undo failed:', error);
          toast.error(
            t('toast.compose.undo_discard_failed', { defaultValue: "Couldn't restore the draft." })
          );
        }
      };

      addUndoAction({
        execute: restore,
        timestamp: Date.now(),
        toastId,
        expirationTime: UNDO_WINDOW_MS
      });
      toast(t('toast.compose.discarded', { defaultValue: 'Draft discarded' }), {
        id: toastId,
        duration: UNDO_WINDOW_MS,
        action: {
          label: (
            <span className="inline-flex items-end gap-1">
              {t('toast.undo')}
              <ShortcutKeyboard variant="text" className="gap-0 p-0" shortcut={'Z'} />
            </span>
          ),
          onClick: () => void restore()
        }
      });
    },
    [removeDraft, updateDraft, addUndoAction, executeCommand, t]
  );
}
