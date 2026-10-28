import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { startArchiveOnSend } from '@/renderer/app/components/card/compose/archiveOnSend';
import { prepareOutgoingDraft } from '@/renderer/app/components/card/compose/prepareOutgoingDraft';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useSignatureAtom } from '@/renderer/app/store/compose/useSignatureAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { checkPendingReminder, hasPendingReminder } from '@/renderer/app/store/queue/useQueueAtom';
import { threadsMapAtom } from '@/renderer/app/store/thread/atoms';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export interface SendComposedOptions {
  /** The draft as written: fields plus the editor's HTML. */
  written: MonoDraft;
  /** The message replied to, in full (loadReplyOriginal), or a promise of it. */
  replyMessage: MonoMessage | null | Promise<MonoMessage | null>;
  /** The message forwarded, in full. */
  forwardMessage?: MonoMessage | null;
  trackingEnabled: boolean;
  /** Takes the editor away (the window closes, the quick reply folds). */
  onClose: () => void;
  /**
   * Undo / a failed send puts what was written back in front of the user.
   * Default: the compose window with it.
   */
  onReopen?: (snapshot: MonoDraft) => void;
  /** An autosave already writing: awaited, so it can't land after the send. */
  waitForSave?: Promise<unknown> | null;
}

/**
 * Send a written draft: the one path behind the compose window's Send and the
 * reader's quick reply, so both send the same message (quote, signature,
 * threading headers) with the same undo countdown, archive-on-send and
 * recovery. Checks that belong to the editor (recipients, uploads, template
 * fields) are the caller's. Returns false when nothing was started.
 *
 * Send takes the editor away at once; the undo countdown toast is the
 * feedback. Preparing the outgoing message (CSS inlining, quoted pictures,
 * the size check) happens during the countdown, and only the draft as
 * written is saved first: that's what Undo and a failed send bring back.
 */
export function useSendComposedDraft() {
  const { t } = useTranslation();
  const { getUidFromEmail, accounts, preference } = useAuth();
  const { signatures } = useSignatureAtom();
  const { updateDraft, sendDraft } = useDraftAtom();
  const executeCommand = useExecuteCommand();
  const { trackEvent } = useUserTrackingData();
  const store = useStore();

  return useCallback(
    async ({
      written,
      replyMessage,
      forwardMessage = null,
      trackingEnabled,
      onClose,
      onReopen,
      waitForSave
    }: SendComposedOptions): Promise<boolean> => {
      const uid = getUidFromEmail(written.from);
      if (!uid) {
        toast.error(t('toast.error.send_mail'));
        return false;
      }
      // What Undo / a failed send reopens.
      const snapshot = new MonoDraft(written.toPlainObject());
      const signatureHtml =
        signatures.find((signature) => signature.id === written.signatureId)?.content ?? '';
      const isMicrosoftAccount =
        accounts.find((account) => account.email === written.from)?.provider === 'microsoft';
      const attachmentBytes = Object.values(written.attachments).reduce(
        (sum, attachment) => sum + (attachment.size || 0),
        0
      );

      onClose();

      // A reply archives its conversation (see archiveOnSend).
      const repliedThreadId = written.threadId;
      const archive = startArchiveOnSend({
        threadId: repliedThreadId,
        thread: repliedThreadId ? store.get(threadsMapAtom)[repliedThreadId] : undefined,
        hasCachedReminder: hasPendingReminder,
        checkReminder: (threadId) => checkPendingReminder(uid, threadId),
        runDone: (args) => void executeCommand('THREAD_DONE', args)
      });

      // Starts now, from a copy of the draft as written; awaited when the
      // countdown ends. A reply whose original is still loading waits for it
      // here (a failed load sends without the quote, as the window does).
      const forPrepare = new MonoDraft(written.toPlainObject());
      const prepared = Promise.resolve(replyMessage)
        .catch(() => null)
        .then((original) =>
          prepareOutgoingDraft({
            draft: forPrepare,
            signatureHtml,
            replyMessage: original,
            forwardMessage,
            uid,
            isMicrosoftAccount,
            attachmentBytes
          })
        );
      prepared.catch(() => undefined);

      const reopen = () => {
        archive.restore();
        const again = new MonoDraft(snapshot.toPlainObject());
        if (onReopen) onReopen(again);
        else void executeCommand('COMPOSE_NEW_MESSAGE', { draft: again });
      };

      try {
        // ...after an autosave that's already writing, so it can't land later.
        await waitForSave?.catch(() => undefined);
        const toPersist = new MonoDraft(written.toPlainObject());
        await updateDraft(uid, toPersist, true, true);
        await sendDraft(
          uid,
          toPersist,
          preference.compose.cancelWindow ?? 10,
          reopen,
          <span className="inline-flex items-end gap-1">
            {t('toast.undo')}{' '}
            <ShortcutKeyboard variant="text" className="gap-0 p-0" shortcut={'Z'} />
          </span>,
          trackingEnabled,
          prepared,
          // A send that fails before it goes: the draft is back in Drafts
          // (with the reason), and the conversation back in the inbox.
          { onSent: archive.onSent, onFailed: archive.restore }
        );

        trackEvent('email_sent', {
          draft_id: written.id,
          thread_id: written.threadId,
          recipient_count: written.to.length,
          cc_count: written.cc.length,
          bcc_count: written.bcc.length,
          subject_length: written.subject.length,
          body_length: written.body.length,
          has_attachments: Object.keys(written.attachments).length > 0
        });
      } catch (e) {
        console.error('Error:', e);
        toast.error(t('toast.error.send_mail'));
        // Nothing was sent: put what was written back in front of the user.
        reopen();
      }
      return true;
    },
    [
      getUidFromEmail,
      signatures,
      accounts,
      store,
      executeCommand,
      updateDraft,
      sendDraft,
      preference.compose.cancelWindow,
      trackEvent,
      t
    ]
  );
}
