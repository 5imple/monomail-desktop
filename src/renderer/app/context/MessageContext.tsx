import { apiClient } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import {
  AIDraftAddedPayload,
  MessageAddedPayload,
  MessageDeletedPayload,
  MessageLabelModificationPayload,
  PushPayload
} from '@/main/api/message/push';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import {
  DBGetMessage,
  DBRemoveMessage,
  DBSaveMessage,
  DBUpdateMessageLabels
} from '@/renderer/app/lib/db/message';
import { DBGetThread } from '@/renderer/app/lib/db/thread';
import electronApi from '@/renderer/app/lib/electronApi';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';

type MessagePayload = PushPayload;
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react';

export interface UpdateType {
  type: 'added' | 'removed' | 'updated' | 'ai_draft';
  threadId: string;
  labelIds?: string[];
  accountId: string;
}

interface MessageContextType {
  handleIncomingMessage: (message: MessagePayload) => Promise<void>;
  subscribe: (callback: (updates: UpdateType[]) => void) => () => void;
  addThreadsToDebounce: (threadIds: string[], delay?: number) => void;
  debouncedThreads: Record<string, number>;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);
// Add a display name for debugging
MessageContext.displayName = 'MessageContext';

export const MessageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeThreadId } = useThreadAtom();
  const { addThread } = useThreadOperationAtom();
  const { searchNewQuery } = useGlobalAtom();
  const { updateDraft } = useDraftAtom();
  const { spaces, activeSpace, switchSpace, setActiveAccountsInSpace } = useSpaceAtom();
  const subscribers = useRef(new Set<(updates: UpdateType[]) => void>());

  // Debounced threads state - moved from atom to context
  const [debouncedThreads, setDebouncedThreads] = useState<Record<string, number>>({});
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const subscribe = useCallback((callback: (updates: UpdateType[]) => void) => {
    subscribers.current.add(callback);
    return () => {
      subscribers.current.delete(callback);
    };
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearInterval(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // Debounce functionality moved from useThreadLabels
  const addThreadsToDebounce = useCallback(
    (threadIds: string[], delay = 15000) => {
      const newExpiration = Date.now() + delay;

      // Batch update to avoid multiple state changes
      setDebouncedThreads((prev) => {
        const next = { ...prev };
        threadIds.forEach((id) => {
          next[id] = newExpiration;
        });
        return next;
      });

      // If the timer isn't started yet, start it
      if (!debounceTimerRef.current) {
        debounceTimerRef.current = setInterval(() => {
          const now = Date.now();

          // Use functional update to batch changes and avoid stale state
          setDebouncedThreads((prev) => {
            const updated = { ...prev };
            let hasExpired = false;

            for (const [id, expireAt] of Object.entries(updated)) {
              if (expireAt <= now) {
                delete updated[id];
                hasExpired = true;
              }
            }

            // If nothing is left or nothing expired, don't trigger a state update
            if (Object.keys(updated).length === 0 && debounceTimerRef.current) {
              clearInterval(debounceTimerRef.current);
              debounceTimerRef.current = null;
            }

            // Only return a new object if something changed
            return hasExpired ? updated : prev;
          });
        }, 1000); // Increased interval to reduce frequency
      }
    },
    [setDebouncedThreads]
  );

  const notifySubscribers = useCallback(
    (updates: UpdateType[]) => {
      const now = Date.now();
      const filteredUpdates = updates.filter(
        (update) => !debouncedThreads[update.threadId] || debouncedThreads[update.threadId] < now
      );

      if (filteredUpdates.length > 0) {
        subscribers.current.forEach((callback) => callback(filteredUpdates));
      }
    },
    [debouncedThreads]
  );

  const handleMessageAdded = useCallback(
    async (addedMessage: MessageAddedPayload) => {
      // Check if message already exists to prevent duplicates
      const existingMessage = await DBGetMessage(addedMessage.aAUid, addedMessage.id);
      if (existingMessage) {
        // Message already exists, skip adding it again
        return;
      }

      const messageResponse = await mailApi.getMessage(addedMessage.aAUid, addedMessage.id);

      if (messageResponse?.payload) {
        const monoMessage = MonoMessage.fromGmailMessage(messageResponse);
        await DBSaveMessage(addedMessage.aAUid, monoMessage);
        notifySubscribers([
          {
            type: 'added',
            threadId: monoMessage.threadId,
            accountId: addedMessage.aAUid
          }
        ]);
      }
    },
    [notifySubscribers]
  );

  const handleAIDraftAdded = useCallback(
    async (addedMessage: AIDraftAddedPayload) => {
      apiClient.setApiActiveUid(addedMessage.aAUid);

      try {
        const response = await draftApi.getDrafts();
        // Process drafts for all accounts in the response
        if (response?.drafts) {
          // Iterate through each account's drafts
          for (const [accountId, drafts] of Object.entries(response.drafts)) {
            // Process each draft for this account
            for await (const draft of drafts) {
              const responseDraft = MonoDraft.fromPlainObject(draft);

              await updateDraft(accountId, responseDraft, false, true, true);
              notifySubscribers([
                {
                  type: 'added',
                  threadId: responseDraft.threadId,
                  accountId: accountId
                }
              ]);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    },
    [notifySubscribers]
  );

  const handleMessageDeleted = useCallback(
    async (deletedMessage: MessageDeletedPayload) => {
      await DBRemoveMessage(deletedMessage.aAUid, deletedMessage.id);
      notifySubscribers([
        {
          type: 'removed',
          threadId: deletedMessage.threadId,
          accountId: deletedMessage.aAUid
        }
      ]);
    },
    [notifySubscribers]
  );

  const handleLabelModification = useCallback(
    async (labelMessage: MessageLabelModificationPayload, isAddOperation: boolean) => {
      // Skip processing if this thread is currently open in the reading pane.
      if (activeThreadId === labelMessage.threadId) {
        return;
      }

      try {
        const labelArray = labelMessage.labels.split(',');

        await DBUpdateMessageLabels(
          labelMessage.aAUid,
          labelMessage.id,
          isAddOperation ? labelArray : [],
          isAddOperation ? [] : labelArray
        );

        // Special handling for trash label
        if (isAddOperation && labelArray.includes('TRASH')) {
          notifySubscribers([
            {
              type: 'removed',
              threadId: labelMessage.threadId,
              accountId: labelMessage.aAUid
            }
          ]);
        } else {
          notifySubscribers([
            {
              type: 'updated',
              threadId: labelMessage.threadId,
              labelIds: labelArray,
              accountId: labelMessage.aAUid
            }
          ]);
        }
      } catch (e) {
        console.error('Error handling label modification:', e);
      }
    },
    [activeThreadId, notifySubscribers]
  );

  const handleIncomingMessage = useCallback(
    async (message: MessagePayload) => {
      const messageData = message.data;
      if (!messageData) return;
      switch (messageData.type) {
        case 'MESSAGE_ADDED':
          await handleMessageAdded(messageData as unknown as MessageAddedPayload);
          break;

        case 'MESSAGE_DELETED':
          await handleMessageDeleted(messageData as unknown as MessageDeletedPayload);
          break;

        case 'LABEL_ADDED':
          await handleLabelModification(
            messageData as unknown as MessageLabelModificationPayload,
            true
          );
          break;

        case 'LABEL_REMOVED':
          await handleLabelModification(
            messageData as unknown as MessageLabelModificationPayload,
            false
          );
          break;

        case 'AI_DRAFT_ADDED':
          await handleAIDraftAdded(messageData as unknown as AIDraftAddedPayload);
          break;

        default:
          console.warn('Unknown message type received:', messageData.type);
          break;
      }
    },
    [handleMessageAdded, handleMessageDeleted, handleLabelModification]
  );

  const handleNotificationClick = useCallback(
    async ({ uid, threadId }: { uid: string; threadId: string }) => {
      try {
        // Find spaces that contain this account
        const accountSpaces = spaces.filter((space) => space.accountUids.includes(uid));

        // If we found spaces containing this account
        if (accountSpaces.length > 0) {
          // If the current active space doesn't contain this account, switch to a space that does
          if (!activeSpace || !activeSpace.accountUids.includes(uid)) {
            // Find if there's a space where this account is active
            const spaceWithActiveAccount = accountSpaces.find((space) =>
              space.activeAccountUids.includes(uid)
            );

            // Prioritize spaces where the account is already active, otherwise use the first available space
            const targetSpace = spaceWithActiveAccount || accountSpaces[0];

            // Set the space as active
            await switchSpace(targetSpace.id);

            // Make sure the account is in the active accounts list for this space
            if (!targetSpace.activeAccountUids.includes(uid)) {
              await setActiveAccountsInSpace([...targetSpace.activeAccountUids, uid]);
            }
          } else if (activeSpace && !activeSpace.activeAccountUids.includes(uid)) {
            // If we're already in the right space but the account isn't active, make it active
            await setActiveAccountsInSpace([...activeSpace.activeAccountUids, uid]);
          }
        }

        // Now handle the thread
        let thread = await DBGetThread(uid, threadId);

        if (!thread) {
          const response = await mailApi.getThread(uid, threadId);
          if (response) {
            thread = MonoThread.fromPlainObject(response);
            await addThread(uid, thread);
            searchNewQuery('category:primary', [thread.id], false);
          }
        } else {
          await addThread(uid, thread);
          searchNewQuery('category:primary', [thread.id], false);
        }
      } catch (e) {
        console.error('Error handling notification click:', e);
      }
    },
    [spaces, activeSpace, switchSpace, setActiveAccountsInSpace, addThread, searchNewQuery]
  );

  useEffect(() => {
    // Push delivery moved to a backend-owned WebSocket in Phase B; the
    // payload shape is unchanged. Browser/PWA builds no longer receive
    // pushes directly here — the desktop main process is the single
    // delivery point now.
    const removePushMessageListener = electronApi.on<MessagePayload>(
      'renderer:push:message-received',
      handleIncomingMessage
    );

    const removeNotificationClickListener = electronApi.on<{ uid: string; threadId: string }>(
      'renderer:notification:native:clicked',
      handleNotificationClick
    );

    return () => {
      removePushMessageListener();
      removeNotificationClickListener();
    };
  }, [handleIncomingMessage, handleNotificationClick]);

  const contextValue = React.useMemo(
    () => ({
      handleIncomingMessage,
      subscribe,
      addThreadsToDebounce,
      debouncedThreads
    }),
    [handleIncomingMessage, subscribe, addThreadsToDebounce, debouncedThreads]
  );

  return <MessageContext.Provider value={contextValue}>{children}</MessageContext.Provider>;
};

export const useMessage = (): MessageContextType => {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
};
