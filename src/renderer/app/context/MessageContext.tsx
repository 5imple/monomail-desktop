import { apiClient } from '@/main/api/apiClient';
import draftApi from '@/main/api/draft/draftApi';
import mailApi from '@/main/api/mail/mailApi';
import {
  AIDraftAddedPayload,
  MessageAddedPayload,
  MessageDeletedPayload,
  MessageLabelModificationPayload,
  NotificationClickPayload,
  PushPayload,
  ThreadRestoredPayload
} from '@/main/api/message/push';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { createTaskLimiter } from '@/main/services/push/taskLimiter';
import {
  DBGetMessage,
  DBRemoveMessage,
  DBSaveMessage,
  DBUpdateMessageLabels
} from '@/renderer/app/lib/db/message';
import { DBGetThread, normalizeGmailLabels } from '@/renderer/app/lib/db/thread';
import electronApi from '@/renderer/app/lib/electronApi';
import { isAudioType, playSound } from '@/renderer/app/lib/soundManager';
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

// A delta catch-up after launch or wake can deliver hundreds of MESSAGE_ADDED
// frames at once. Fetch the unknown messages a few at a time instead of one
// request per frame all at once. (Not a Graph $batch: the Microsoft adapter's
// getMessage also resolves folder labels and inline/meeting parts per message,
// which a raw batch here would have to duplicate.)
const MESSAGE_FETCH_CONCURRENCY = 4;
const messageFetchLimiter = createTaskLimiter(MESSAGE_FETCH_CONCURRENCY);
// 'added' updates arriving within this window reach subscribers as one batch.
const ADDED_UPDATES_FLUSH_MS = 100;

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

  // Removals that came in while their conversation was "changed here" (just
  // above): delivered once that window ends instead of dropped. The cache
  // already changed, so dropping one left a conversation archived in Outlook
  // listed for the session. The list reads the cache when it gets one, so a
  // late removal acts on the conversation as it is by then (back in the Inbox
  // after an undo: it stays).
  const heldRemovalsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const held = heldRemovalsRef.current;
    return () => {
      held.forEach((timer) => clearTimeout(timer));
      held.clear();
    };
  }, []);

  const notifySubscribers = useCallback(
    (updates: UpdateType[]) => {
      const now = Date.now();
      const filteredUpdates = updates.filter(
        (update) => !debouncedThreads[update.threadId] || debouncedThreads[update.threadId] < now
      );
      for (const update of updates) {
        if (update.type !== 'removed' || filteredUpdates.includes(update)) continue;
        const key = `${update.accountId}:${update.threadId}`;
        clearTimeout(heldRemovalsRef.current.get(key));
        const wait = Math.max(0, (debouncedThreads[update.threadId] ?? now) - now) + 1500;
        heldRemovalsRef.current.set(
          key,
          setTimeout(() => {
            heldRemovalsRef.current.delete(key);
            // Read when it fires: the ref is set further down (below).
            notifySubscribersRef.current([update]);
          }, wait)
        );
      }

      if (filteredUpdates.length > 0) {
        subscribers.current.forEach((callback) => callback(filteredUpdates));
      }
    },
    [debouncedThreads]
  );

  // Coalesce 'added' updates: a burst of frames reaches subscribers as one
  // batch (de-duplicated by thread) instead of one list update per message.
  const notifySubscribersRef = useRef(notifySubscribers);
  useEffect(() => {
    notifySubscribersRef.current = notifySubscribers;
  }, [notifySubscribers]);
  const pendingAddedRef = useRef<UpdateType[]>([]);
  const addedFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedFlushTimerRef.current) {
        clearTimeout(addedFlushTimerRef.current);
        addedFlushTimerRef.current = null;
      }
    };
  }, []);

  const queueAddedUpdate = useCallback((update: UpdateType) => {
    pendingAddedRef.current.push(update);
    if (addedFlushTimerRef.current) return;
    addedFlushTimerRef.current = setTimeout(() => {
      addedFlushTimerRef.current = null;
      const seen = new Set<string>();
      const updates = pendingAddedRef.current.splice(0).filter((u) => {
        const key = `${u.accountId}:${u.threadId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (updates.length > 0) notifySubscribersRef.current(updates);
    }, ADDED_UPDATES_FLUSH_MS);
  }, []);

  // Threads changed here in the last few seconds (addThreadsToDebounce), read
  // without re-rendering on every change.
  const debouncedThreadsRef = useRef(debouncedThreads);
  useEffect(() => {
    debouncedThreadsRef.current = debouncedThreads;
  }, [debouncedThreads]);

  // The Microsoft delta reports a message again when it changes elsewhere
  // (phone, Outlook on the web): read or marked unread, or moved between
  // Focused and Other. Its cached copy still has the old state, and skipping
  // the frame as a duplicate left the row bold (or not), or in the wrong
  // Focused/Other tab, until a refresh.
  const syncChangedState = useCallback(
    async (frame: MessageAddedPayload, cachedLabels: string[], threadId: string) => {
      if (!frame.aAUid.startsWith('microsoft:') || !threadId) return;
      const frameLabels = frame.labels ?? '';
      const add: string[] = [];
      const remove: string[] = [];

      // Not for a thread read or marked unread here moments ago: the delta
      // can still carry the state from before that change.
      const frameUnread = /\bUNREAD\b/.test(frameLabels);
      const changedHere = (debouncedThreadsRef.current[threadId] ?? 0) > Date.now();
      if (frameUnread !== cachedLabels.includes('UNREAD') && !changedHere) {
        (frameUnread ? add : remove).push('UNREAD');
      }

      const inference = /\binference:(focused|other)\b/.exec(frameLabels)?.[1];
      if (inference && !cachedLabels.includes(`inference:${inference}`)) {
        add.push(`inference:${inference}`);
        remove.push(`inference:${inference === 'focused' ? 'other' : 'focused'}`);
      }

      if (add.length === 0 && remove.length === 0) return;
      await DBUpdateMessageLabels(frame.aAUid, frame.id, add, remove);
      notifySubscribersRef.current([{ type: 'updated', threadId, accountId: frame.aAUid }]);
    },
    []
  );

  const handleMessageAdded = useCallback(
    async (addedMessage: MessageAddedPayload) => {
      // Check if message already exists to prevent duplicates
      const existingMessage = await DBGetMessage(addedMessage.aAUid, addedMessage.id);
      if (existingMessage) {
        // Usually a duplicate frame — skip. But a mailbox delta also reports a
        // message that moved INTO the Inbox (un-archived / restored elsewhere),
        // and its cached copy still carries the old labels: skipping left it
        // hidden until a full refresh. Refresh it when the frame says Inbox and
        // the cache disagrees.
        const frameSaysInbox = /\bINBOX\b/.test(addedMessage.labels ?? '');
        const cachedLabels = existingMessage.labelIds ?? [];
        const cacheDisagrees =
          !cachedLabels.includes('INBOX') ||
          cachedLabels.includes('TRASH') ||
          cachedLabels.includes('SPAM');
        if (!(frameSaysInbox && cacheDisagrees)) {
          await syncChangedState(addedMessage, cachedLabels, existingMessage.threadId);
          return;
        }
      }

      // Bounded concurrency, and one fetch per message even when duplicate
      // frames for it arrive while the first fetch is still running.
      await messageFetchLimiter.runOnce(`${addedMessage.aAUid}:${addedMessage.id}`, async () => {
        const messageResponse = await mailApi.getMessage(addedMessage.aAUid, addedMessage.id);

        if (messageResponse?.payload) {
          const monoMessage = MonoMessage.fromGmailMessage(messageResponse);
          await DBSaveMessage(addedMessage.aAUid, monoMessage);
          queueAddedUpdate({
            type: 'added',
            threadId: monoMessage.threadId,
            accountId: addedMessage.aAUid
          });
        }
      });
    },
    [queueAddedUpdate, syncChangedState]
  );

  // A conversation came back to the Inbox with no new message (a due snooze):
  // re-fetch it so the cached labels include INBOX again, then let the list
  // pick it up.
  const handleThreadRestored = useCallback(
    async ({ aAUid, threadId }: ThreadRestoredPayload) => {
      if (!aAUid || !threadId) return;
      try {
        const response = await mailApi.getThread(aAUid, threadId);
        if (!response) return;
        const thread = MonoThread.fromPlainObject(response);
        await addThread(aAUid, thread);
        queueAddedUpdate({ type: 'added', threadId: thread.id, accountId: aAUid });
      } catch (e) {
        console.error('Error refreshing a thread back from snooze:', e);
      }
    },
    [addThread, queueAddedUpdate]
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
      // Gmail tombstones carry the threadId; the Microsoft delta poller's
      // @removed tombstones carry only the message id, so resolve the thread
      // from the local cache before pruning it.
      let threadId = deletedMessage.threadId;
      if (!threadId) {
        threadId = (await DBGetMessage(deletedMessage.aAUid, deletedMessage.id))?.threadId ?? '';
      }
      await DBRemoveMessage(deletedMessage.aAUid, deletedMessage.id);
      notifySubscribers([
        {
          type: 'removed',
          threadId,
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
        const labelArray = normalizeGmailLabels(labelMessage.labels);

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

        case 'THREAD_RESTORED':
          await handleThreadRestored(messageData as unknown as ThreadRestoredPayload);
          break;

        default:
          console.warn('Unknown message type received:', messageData.type);
          break;
      }
    },
    [
      handleMessageAdded,
      handleMessageDeleted,
      handleLabelModification,
      handleAIDraftAdded,
      handleThreadRestored
    ]
  );

  const handleNotificationClick = useCallback(
    async (payload?: NotificationClickPayload) => {
      const uid = payload?.uid;
      const threadId = payload?.threadId;
      if (!uid) return;
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

        // Not about one conversation ("N new emails" summary, a scheduled send
        // with no thread): show the inbox.
        if (!threadId) {
          searchNewQuery('category:primary', [], false);
          return;
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

    const removeNotificationClickListener = electronApi.on<NotificationClickPayload | undefined>(
      'renderer:notification:native:clicked',
      handleNotificationClick
    );

    // New-mail banners are silent; main asks for the chosen alert sound once
    // per batch so Settings > Notifications > Alert sound applies to new mail.
    const removeSoundListener = electronApi.on<unknown>('renderer:notification:sound', (sound) => {
      if (isAudioType(sound)) playSound(sound);
    });

    return () => {
      removePushMessageListener();
      removeNotificationClickListener();
      removeSoundListener();
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
