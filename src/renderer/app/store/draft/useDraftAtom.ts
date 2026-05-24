// src/store/draft/useDraftAtom.ts

import mailApi from '@/main/api/mail/mailApi';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import { buildRawMessage } from '@/renderer/app/lib/mime/buildRawMessage';
import { DBGetDraftById, DBRemoveDraft, DBSaveDraft } from '@/renderer/app/lib/db/draft';
import {
  DBDeleteAttachmentsForDraft,
  DBGetAttachmentsForDraft
} from '@/renderer/app/lib/db/draftAttachment';
import { DBGetThread, DBSaveThread } from '@/renderer/app/lib/db/thread';
import {
  calculateAttachments,
  calculateCombinedLabels,
  calculateRecipients,
  calculateRemainingRecipients
} from '@/renderer/app/lib/db/thread/utils';
import { useMessageOperationAtom } from '@/renderer/app/store/message/useMessageOperationAtom';
import { selectedThreadsAtom } from '@/renderer/app/store/thread/atoms';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { draftByThreadAtom, draftsMapByAccountAtom, sendDraftQueueAtom } from './atoms';

// Add a new type for tracking pending send operations
type PendingSend = {
  uid: string;
  draftId: string;
  timerId: NodeJS.Timeout;
  toastId: string | number;
};

export function useDraftAtom() {
  const [draftsMapByAccount, setDraftsMapByAccount] = useAtom(draftsMapByAccountAtom);
  const [selectedThreads, setSelectedThreads] = useAtom(selectedThreadsAtom);
  const [sendDraftQueue, setSendDraftQueue] = useAtom(sendDraftQueueAtom);
  const [draftsByThread, setDraftsByThread] = useAtom(draftByThreadAtom);
  const { setThreadsMap } = useThreadAtom();
  const { addThread, removeThreadFromMap } = useThreadOperationAtom();
  const { addMessage } = useMessageOperationAtom();
  const { addUndoAction } = useUndoManager();
  const { t } = useTranslation();

  // Use a ref to track pending send operations
  const pendingSendsRef = useRef<Record<string, PendingSend>>({});

  // Helper function to fetch and save the sent message
  const fetchAndSaveSentMessage = useCallback(
    async (uid: string, messageId: string): Promise<void> => {
      try {
        console.log('Fetching sent message with ID:', messageId);

        // Fetch the message from Gmail API
        const fetchedMessage = await mailApi.getMessage(uid, messageId);

        if (fetchedMessage?.payload) {
          // Convert to MonoMessage format
          const monoMessage = MonoMessage.fromPlainObject(
            MonoMessage.fromGmailMessage(fetchedMessage).toPlainObject()
          );

          console.log('Adding sent message to thread:', monoMessage.threadId);

          // Add the message to the thread
          await addMessage(uid, monoMessage, true);

          console.log('Successfully added sent message to thread');
        } else {
          console.warn('Failed to fetch sent message with ID:', messageId);
        }
      } catch (error) {
        console.error('Error fetching and saving sent message:', error);
      }
    },
    [addMessage]
  );

  // Update draftsByThread whenever draftsMapByAccount changes
  const updateDraft = useCallback(
    async (
      uid: string,
      draft: MonoDraft,
      api: boolean = true,
      saveLocal: boolean = true,
      override = false
    ): Promise<void> => {
      if (!draft.id) {
        console.warn('No draft id found');
        return;
      }

      // Check if threadId exists and if that thread exists in the database
      if (draft.threadId) {
        const existingThread = await DBGetThread(uid, draft.threadId);

        // If thread doesn't exist but threadId is specified, we need to handle this case
        if (!existingThread && !override) {
          draft.update({ threadId: draft.id, messageId: '' });
        }
      }

      // Persist locally only (standalone: no backend draft store).
      if (saveLocal) {
        await DBSaveDraft(uid, draft);
      }

      // Update the thread if the draft belongs to a thread
      if (draft.threadId) {
        const thread = await DBGetThread(uid, draft.threadId);
        if (thread) {
          // Update or add the draft in the thread's items
          const existingIndex = thread.items.findIndex((item) => item.id === draft.id);
          if (existingIndex > -1) {
            thread.items[existingIndex] = draft;
          } else {
            thread.items.push(draft);
          }

          // Recalculate thread properties based on all items
          const remainingItems = thread.items.filter(Boolean) as (MonoMessage | MonoDraft)[];

          thread.from = calculateRecipients(remainingItems, 'from');
          thread.to = calculateRecipients(remainingItems, 'to');
          thread.cc = calculateRecipients(remainingItems, 'cc');
          thread.bcc = calculateRecipients(remainingItems, 'bcc');

          thread.subject = remainingItems.find((item) => item.subject)?.subject || '';
          thread.snippet =
            remainingItems.find((item): item is MonoMessage => 'snippet' in item)?.snippet || '';

          thread.attachments = calculateAttachments(remainingItems);
          thread.labelIds = calculateCombinedLabels(remainingItems);

          // Save the updated thread
          await DBSaveThread(uid, thread);

          // Update state
          setThreadsMap((prev) => ({
            ...prev,
            [thread.id]: thread
          }));
        }
      }

      // Update the drafts map for the specific account
      setDraftsMapByAccount((prevMap) => {
        const accountDrafts = prevMap[uid] || {};
        return {
          ...prevMap,
          [uid]: {
            ...accountDrafts,
            [draft.id]: draft
          }
        };
      });
    },
    [setDraftsMapByAccount, setThreadsMap]
  );

  // Remove a draft
  const removeDraft = useCallback(
    async (uid: string, draftId: string, callApi: boolean = true) => {
      try {
        const draftData = await DBGetDraftById(uid, draftId);

        if (draftData) {
          const thread = await DBGetThread(uid, draftData.threadId);

          await DBRemoveDraft(uid, draftId);
          // Discard any locally-held attachment bytes for this draft.
          await DBDeleteAttachmentsForDraft(uid, draftId);

          if (thread) {
            // Remove the draft from the thread
            thread.items = thread.items.filter((item) => item.id !== draftId);

            if (thread.items.length > 0) {
              const remainingItems = thread.items.filter(Boolean) as (MonoMessage | MonoDraft)[];
              thread.from = calculateRemainingRecipients(remainingItems, 'from');
              thread.to = calculateRemainingRecipients(remainingItems, 'to');
              thread.cc = calculateRemainingRecipients(remainingItems, 'cc');
              thread.bcc = calculateRemainingRecipients(remainingItems, 'bcc');
              thread.attachments = calculateAttachments(remainingItems);
              thread.labelIds = calculateCombinedLabels(remainingItems);

              // If thread still has items, update it
              setThreadsMap((prev) => ({
                ...prev,
                [thread.id]: thread
              }));
            } else {
              // If no items remain, remove the thread (Already removed in DB)
              await removeThreadFromMap(thread.id);
              setSelectedThreads((prev) => prev.filter((id) => id !== thread.id));
            }
          }

          // Update state - remove draft from the specific account
          setDraftsMapByAccount((prevMap) => {
            const newAccountMap = { ...prevMap };
            if (newAccountMap[uid]) {
              const newDraftsMap = { ...newAccountMap[uid] };
              delete newDraftsMap[draftId];
              newAccountMap[uid] = newDraftsMap;
            }
            return newAccountMap;
          });
        }
      } catch (error) {
        console.error('Error deleting draft:', error);
      }
    },
    [setDraftsMapByAccount, setThreadsMap, setSelectedThreads, removeThreadFromMap]
  );

  // Get all drafts across all accounts
  const getAllDrafts = useCallback(() => {
    const allDrafts: Record<string, MonoDraft> = {};

    Object.values(draftsMapByAccount).forEach((accountDrafts) => {
      Object.entries(accountDrafts).forEach(([draftId, draft]) => {
        allDrafts[draftId] = draft;
      });
    });

    return allDrafts;
  }, [draftsMapByAccount]);

  // Get drafts for a specific account
  const getDraftsForAccount = useCallback(
    (accountId: string) => {
      return draftsMapByAccount[accountId] || {};
    },
    [draftsMapByAccount]
  );

  // Reset all drafts
  const resetDrafts = useCallback(() => {
    setDraftsMapByAccount({});
  }, [setDraftsMapByAccount]);

  const handleSendCompleted = useCallback(
    async (uid: string, draftId: string): Promise<void> => {
      // Remove draft from sendDraftQueueAtom
      setSendDraftQueue((prevQueue) => {
        return prevQueue.filter((value) => value != draftId);
      });
      await removeDraft(uid, draftId, false);
    },
    [setSendDraftQueue, removeDraft]
  );

  const cancelSend = useCallback(
    async (uid: string, draftId: string): Promise<void> => {
      // Check if there's a pending send operation
      const pendingSend = pendingSendsRef.current[draftId];
      if (pendingSend) {
        // Clear the timer (might be interval or timeout depending on stage)
        clearTimeout(pendingSend.timerId);
        // Dismiss the toast
        toast.dismiss(pendingSend.toastId);
        // Remove from pending sends
        delete pendingSendsRef.current[draftId];
      }

      // Remove draft from sendDraftQueueAtom
      setSendDraftQueue((prevQueue) => {
        return prevQueue.filter((value) => value != draftId);
      });

      // Add draft back to draftsMap
      const draftData = await DBGetDraftById(uid, draftId);
      if (draftData) {
        const draft = MonoDraft.fromPlainObject(draftData);

        // Add draft back to the specific account
        setDraftsMapByAccount((prevMap) => {
          const accountDrafts = prevMap[uid] || {};
          return {
            ...prevMap,
            [uid]: {
              ...accountDrafts,
              [draft.id]: draft
            }
          };
        });

        // If the thread was removed before, add it back
        if (draft.threadId) {
          const thread = await DBGetThread(uid, draft.threadId);
          if (thread && thread.items.length === 1 && thread.items[0].id === draft.id) {
            addThread(uid, thread);
          }
        }
      }
    },
    [setSendDraftQueue, setDraftsMapByAccount, addThread]
  );

  // New function to actually send the draft immediately
  const sendDraftImmediately = useCallback(
    async (
      uid: string,
      draftId: string,
      withTracking: boolean = false,
      draft?: MonoDraft
    ): Promise<void> => {
      // Show promise toast for send operation
      toast.promise(
        async () => {
          const fullDraft = draft ?? (await DBGetDraftById(uid, draftId));
          if (!fullDraft) throw new Error('Draft not found');

          // Standalone: every message sends straight through Gmail. Build the
          // full MIME (incl. attachments + inline images) from locally-held
          // bytes. Only thread when threadId is a real Gmail id (< 20 chars,
          // per the repo convention); a new-compose placeholder id would 400.
          const attachmentRecords = await DBGetAttachmentsForDraft(uid, draftId);
          const raw = await buildRawMessage(fullDraft, attachmentRecords);
          const gmailThreadId =
            fullDraft.threadId && fullDraft.threadId.length < 20 ? fullDraft.threadId : undefined;
          const sent = await mailApi.sendMessage(uid, raw, gmailThreadId);
          const messageId = sent?.id;

          // Handle the completion of sending
          await handleSendCompleted(uid, draftId);
          // Drop the locally-held attachment bytes now the message is out.
          await DBDeleteAttachmentsForDraft(uid, draftId);

          // Fetch and save the sent message using the messageId
          if (messageId) {
            await fetchAndSaveSentMessage(uid, messageId);
          } else {
            console.warn('No messageId returned from send');
          }
        },
        {
          loading: t('toast.compose.sending'),
          success: t('toast.compose.sent'),
          error: (err) => {
            console.error('Error sending draft:', err);

            // Add the draft back if sending failed
            cancelSend(uid, draftId);

            return t('toast.error.send_mail');
          }
        }
      );
    },
    [handleSendCompleted, cancelSend, fetchAndSaveSentMessage, t]
  );

  const sendDraft = useCallback(
    async (
      uid: string,
      draft: MonoDraft,
      delay: number,
      onCancel?: () => void,
      cancelLabel?: React.ReactNode,
      withTracking: boolean = false
    ): Promise<void> => {
      // 1. Add draft to sendDraftQueue
      setSendDraftQueue((prevQueue) => [...prevQueue, draft.id]);

      // 2. Remove draft from draftsMapByAccount
      setDraftsMapByAccount((prevMap) => {
        const newMap = { ...prevMap };
        if (newMap[uid]) {
          const accountDrafts = { ...newMap[uid] };
          delete accountDrafts[draft.id];
          newMap[uid] = accountDrafts;
        }
        return newMap;
      });

      // If the draft was the only item in the thread, remove the thread
      if (draft.threadId) {
        const thread = await DBGetThread(uid, draft.threadId);
        if (thread && thread.items.length === 1 && thread.items[0].id === draft.id) {
          // Remove the thread
          setSelectedThreads((prev) => {
            return prev.filter((id) => id != draft.threadId);
          });
          removeThreadFromMap(draft.threadId);
        }
      }

      // If delay is 0, send immediately
      if (delay <= 0) {
        await sendDraftImmediately(uid, draft.id, withTracking);
        return;
      }

      // Show toast with cancel action and handle countdown in one flow
      let remaining = delay;
      const toastId = toast(t('toast.compose.sending_delay', { delay }), {
        duration: delay * 1000,
        action: {
          label: cancelLabel ?? t('toast.compose.cancel'),
          onClick: async () => {
            // Clear the timer when cancel is clicked
            const pendingSend = pendingSendsRef.current[draft.id];
            if (pendingSend && pendingSend.timerId) {
              clearTimeout(pendingSend.timerId);
              delete pendingSendsRef.current[draft.id];
            }

            await cancelSend(uid, draft.id);
            onCancel?.();
            toast.dismiss(toastId);
            toast.success(t('toast.compose.canceled'));
          }
        }
      });

      const cancelSendingFunction = async () => {
        // Clear the timer
        const pendingSend = pendingSendsRef.current[draft.id];
        if (pendingSend && pendingSend.timerId) {
          clearTimeout(pendingSend.timerId);
          delete pendingSendsRef.current[draft.id];
        }

        // Dismiss the toast (this will be handled in the undo action)
        // toast.dismiss(toastId);

        // Cancel the send operation
        await cancelSend(uid, draft.id);
        onCancel?.();

        // Show success toast if not called from undo action
        // (the undo action will show its own success toast)
        // toast.success('Send canceled');
      };

      addUndoAction({
        execute: cancelSendingFunction,
        timestamp: Date.now(),
        toastId: toastId,
        expirationTime: delay * 1000
      });
      // Use a single interval for both countdown and sending
      const intervalId = setInterval(async () => {
        remaining -= 1;

        if (remaining > 0) {
          // Update toast with remaining time
          toast(t('toast.compose.sending_delay', { delay: remaining }), { id: toastId });
        } else {
          // Clear interval and send the draft when countdown reaches zero
          clearInterval(intervalId);
          toast.dismiss(toastId);

          await sendDraftImmediately(uid, draft.id, withTracking, draft);
          delete pendingSendsRef.current[draft.id];
        }
      }, 1000);

      // Store information for potential cancellation
      pendingSendsRef.current[draft.id] = {
        uid,
        draftId: draft.id,
        timerId: intervalId,
        toastId
      };
    },
    [
      setSendDraftQueue,
      setDraftsMapByAccount,
      setSelectedThreads,
      removeThreadFromMap,
      sendDraftImmediately,
      cancelSend,
      t
    ]
  );

  // Set drafts for a specific account
  const setDraftsForAccount = useCallback(
    (accountId: string, drafts: Record<string, MonoDraft>) => {
      setDraftsMapByAccount((prev) => ({
        ...prev,
        [accountId]: drafts
      }));
    },
    [setDraftsMapByAccount]
  );

  return {
    draftsMapByAccount,
    setDraftsMapByAccount,
    draftsByThread,
    updateDraft,
    removeDraft,
    resetDrafts,
    sendDraft,
    sendDraftImmediately,
    cancelSend,
    handleSendCompleted,
    setDraftsByThread,
    sendDraftQueue,
    getAllDrafts,
    getDraftsForAccount,
    setDraftsForAccount
  };
}
