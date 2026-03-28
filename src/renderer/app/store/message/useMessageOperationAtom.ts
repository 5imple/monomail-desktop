import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { isThreadItemWithLabels } from '@/main/models/thread/ThreadItem';
import {
  DBGetMessage,
  DBRemoveMessage,
  DBSaveMessage,
  DBUpdateMessageLabels
} from '@/renderer/app/lib/db/message';
import { DBRemoveThread, DBSaveThread } from '@/renderer/app/lib/db/thread';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useCallback } from 'react';

export function useMessageOperationAtom() {
  const { setThreadsMap } = useThreadAtom();

  const updateMessageState = useCallback(
    async (
      uid: string,
      messageId: string,
      addLabelIds: string[],
      removeLabelIds: string[],
      saveToLocal: boolean = true
    ) => {
      try {
        let message = await DBGetMessage(uid, messageId);

        if (!message) {
          console.warn(`Message with ID ${messageId} not found in DB, fetching from API.`);

          const fetchedMessage = await mailApi.getMessage(uid, messageId);
          if (!fetchedMessage) {
            console.error(`Message with ID ${messageId} could not be fetched.`);
            return;
          }
          message = MonoMessage.fromGmailMessage(fetchedMessage);
          if (saveToLocal) {
            await DBSaveMessage(uid, message);
          }
        }

        const { threadId } = message;

        setThreadsMap((prev) => {
          const thread = prev[threadId];
          if (!thread) return prev;

          const updatedItems = thread.items.map((item) => {
            if (item.id === messageId && isThreadItemWithLabels(item)) {
              const updatedLabels = [
                ...item.labelIds.filter((label) => !removeLabelIds.includes(label)),
                ...addLabelIds.filter((label) => !item.labelIds.includes(label))
              ];
              return { ...item, labelIds: updatedLabels };
            }
            return item;
          });

          return {
            ...prev,
            [threadId]: new MonoThread({ ...thread, items: updatedItems })
          };
        });

        if (saveToLocal) {
          await DBUpdateMessageLabels(uid, messageId, addLabelIds, removeLabelIds);
        }
      } catch (error) {
        console.error(`Error updating message state for ID ${messageId}:`, error);
      }
    },
    [setThreadsMap]
  );

  const removeMessage = useCallback(
    async (uid: string, messageId: string, saveToLocal: boolean = true) => {
      try {
        const message = await DBGetMessage(uid, messageId);

        if (!message) {
          console.error(`Message with ID ${messageId} not found.`);
          return;
        }

        const { threadId } = message;

        setThreadsMap((prev) => {
          const thread = prev[threadId];
          if (!thread) return prev;

          const updatedItems = thread.items.filter((item) => item.id !== messageId);
          const updatedThreads = { ...prev };

          if (updatedItems.length > 0) {
            updatedThreads[threadId] = new MonoThread({ ...thread, items: updatedItems });
          } else {
            delete updatedThreads[threadId]; // Remove thread if no items remain
          }

          if (saveToLocal) {
            DBRemoveMessage(uid, messageId);
            if (updatedItems.length === 0) {
              DBRemoveThread(uid, threadId);
            }
          }

          return updatedThreads;
        });
      } catch (error) {
        console.error(`Error removing message with ID ${messageId}:`, error);
      }
    },
    [setThreadsMap]
  );

  const addMessageToThread = useCallback(
    async (uid: string, threadId: string, newMessage: MonoMessage, saveToLocal: boolean = true) => {
      setThreadsMap((prev) => {
        const thread = prev[threadId];
        if (!thread) return prev;

        const updatedItems = [
          ...thread.items.filter((item) => item.id !== newMessage.id),
          newMessage
        ];

        return {
          ...prev,
          [threadId]: new MonoThread({ ...thread, items: updatedItems })
        };
      });

      if (saveToLocal) {
        await DBSaveMessage(uid, newMessage);
      }
    },
    [setThreadsMap]
  );

  const addMessage = useCallback(
    async (uid: string, newMessage: MonoMessage, saveToLocal: boolean = true) => {
      setThreadsMap((prev) => {
        if (prev[newMessage.threadId]) {
          const thread = prev[newMessage.threadId];
          const updatedItems = [
            ...thread.items.filter((item) => item.id !== newMessage.id),
            newMessage
          ];
          return {
            ...prev,
            [newMessage.threadId]: new MonoThread({ ...thread, items: updatedItems })
          };
        }

        return prev;
      });

      const fetchedThread = await mailApi.getThread(uid, newMessage.threadId);
      if (fetchedThread) {
        const parsedThread = MonoThread.fromPlainObject(fetchedThread);
        parsedThread.items.push(newMessage);

        if (saveToLocal) {
          await DBSaveThread(uid, parsedThread);
        }
      }

      if (saveToLocal) {
        await DBSaveMessage(uid, newMessage);
      }
    },
    [setThreadsMap]
  );

  const replaceMessageInThread = useCallback(
    async (
      uid: string,
      threadId: string,
      updatedMessage: MonoMessage,
      saveToLocal: boolean = true
    ) => {
      setThreadsMap((prev) => {
        const thread = prev[threadId];
        if (!thread) return prev;

        const updatedItems = thread.items.map((item) =>
          item.id === updatedMessage.id ? updatedMessage : item
        );

        return {
          ...prev,
          [threadId]: new MonoThread({ ...thread, items: updatedItems })
        };
      });

      if (saveToLocal) {
        await DBSaveMessage(uid, updatedMessage);
      }
    },
    [setThreadsMap]
  );

  return {
    updateMessageState,
    removeMessage,
    addMessageToThread,
    addMessage,
    replaceMessageInThread
  };
}
