import { payloadHasBodyData } from '@/main/models/message/bodyData';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import { isComposeDraftId } from '@/main/utils';
import DraftCard from '@/renderer/app/components/card/DraftCard';
import MessageCard from '@/renderer/app/components/card/MessageCard';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import DisplayPanelHeader from '@/renderer/app/containers/header/DisplayPanelHeader';
import ThreadReplyBar from '@/renderer/app/containers/panel/ThreadReplyBar';
import ThreadLabelBadges from '@/renderer/app/containers/panel/ThreadLabelBadges';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { DBSaveThread } from '@/renderer/app/lib/db/thread';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { focusedElementOwnsKey } from '@/renderer/app/lib/hotkeyGuards';
import { layoutConversation } from '@/renderer/app/lib/messageHistory';
import { pickOpenMessages } from '@/renderer/app/lib/readerExpansion';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import { cn } from '@/renderer/app/lib/utils';
import { useComposeInlineAtom } from '@/renderer/app/store/compose/useComposeInlineAtom';
import {
  activeThreadIdAtom,
  filteredThreadIdsAtom,
  threadsMapAtom
} from '@/renderer/app/store/thread/atoms';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { fetchFullThread, threadNeedsFullBody } from '@/renderer/app/lib/threadBodyPrefetch';
import { markReaderOpen, markReaderPhase } from '@/renderer/app/lib/readerTiming';
import log from 'electron-log';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { atom, useAtomValue, useStore } from 'jotai';
import { threadExitIntentAtom } from '@/renderer/app/store/thread/exitIntentAtom';
import { usePendingReaderAdvance } from '@/renderer/app/hooks/usePendingReaderAdvance';
import { pendingAdvanceAtom } from '@/renderer/app/store/thread/readerAdvance';
import { ReaderTransition, readerVariants } from '@/renderer/app/containers/list/threadRowMotion';

interface DisplayPanelProps {
  className?: string;
  readerPhase?: 'closed' | 'opening' | 'open' | 'closing';
}

// The email Done / Trash move on to: the one below (at the end of what's
// loaded, the next page is fetched ahead; usePendingReaderAdvance), or above
// for the last. A string, so the reader re-renders only when it changes, not
// on every update of the thread store.
const nextThreadIdAtom = atom((get) => {
  const activeThreadId = get(activeThreadIdAtom);
  if (!activeThreadId) return null;
  const threadsMap = get(threadsMapAtom);
  const ids = get(filteredThreadIdsAtom).filter((id) => threadsMap[id]);
  const index = ids.indexOf(activeThreadId);
  return index === -1 ? null : (ids[index + 1] ?? ids[index - 1] ?? null);
});

const whenIdle = (task: () => void) => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(task, { timeout: 1500 });
  } else {
    setTimeout(task, 50);
  }
};

/**
 * Write a fetched thread to IndexedDB once the frame showing it is painted.
 * The write (a structured clone of every body, plus contact bookkeeping) used
 * to be awaited between the body landing and the reader drawing it.
 */
const persistAfterPaint = (accountId: string, thread: MonoThread) => {
  const save = () =>
    DBSaveThread(accountId, thread)
      .then(() => markReaderPhase('db saved', thread.id))
      .catch((error) => log.error('[reader] saving the thread to the cache failed', error));
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => whenIdle(save));
  } else {
    whenIdle(save);
  }
};

const isComposeExpanded = () => !!document.querySelector('[data-compose-expanded="true"]');
const isOverlayOpen = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]'
  );

const NO_OVERRIDES: Record<string, boolean> = {};

export const DisplayPanel = ({ className, readerPhase = 'closed' }: DisplayPanelProps) => {
  const store = useStore();
  const activeThreadId = useAtomValue(activeThreadIdAtom);
  // Dev timing starts here, while rendering the open (idempotent per thread).
  markReaderOpen(activeThreadId);
  // Only the open thread: a narrow subscription (useThreadRowAtom's pattern),
  // not the whole store.
  const activeThreadAtom = useMemo(
    () => atom((get) => (activeThreadId ? (get(threadsMapAtom)[activeThreadId] ?? null) : null)),
    [activeThreadId]
  );
  const stableThread = useAtomValue(activeThreadAtom);
  const nextThreadId = useAtomValue(nextThreadIdAtom);
  const { unmarkThreadsAsUnread } = useThreadLabelAtom();
  const { updateThread } = useThreadOperationAtom();
  const { t } = useTranslation();

  const exitIntents = useAtomValue(threadExitIntentAtom);
  // Done on the last loaded email: the next page is on its way, and this
  // email stays up until it lands (usePendingReaderAdvance).
  usePendingReaderAdvance();
  const waitingToLeaveId = useAtomValue(pendingAdvanceAtom)?.leavingId ?? null;
  const reduceMotion = useReducedMotion();

  // The email on screen. Derived while rendering, so a body landing in the
  // store is drawn in that same render (it used to be copied into local state
  // by an effect, one more render and commit before the text appeared). Done /
  // Trash take the open email out of the list a moment before the reader
  // moves on: it stays up for that moment, so it hands over straight to the
  // next email (going through an empty reader blanked the toolbar and lost
  // the hand-over motion). Nothing follows (e.g. moved to a folder): cleared.
  const lastShownRef = useRef<MonoThread | null>(null);
  const leavingThreadIdRef = useRef<string | null>(null);
  const [holdReleasedFor, setHoldReleasedFor] = useState<string | null>(null);
  let thread: MonoThread | null = stableThread;
  if (!thread && activeThreadId) {
    const last = lastShownRef.current;
    if (
      last &&
      last.id === activeThreadId &&
      (waitingToLeaveId === last.id ||
        (holdReleasedFor !== last.id &&
          (exitIntents[last.id] || leavingThreadIdRef.current === last.id)))
    ) {
      thread = last;
    }
  }
  const shownId = thread?.id ?? null;
  const shownIdRef = useRef(shownId);
  shownIdRef.current = shownId;

  useEffect(() => {
    if (stableThread) {
      lastShownRef.current = stableThread;
      leavingThreadIdRef.current = null;
      return undefined;
    }
    if (thread) {
      // Holding the leaving email (see above) for a moment.
      leavingThreadIdRef.current = thread.id;
      const leavingId = thread.id;
      const timer = setTimeout(() => setHoldReleasedFor(leavingId), 400);
      return () => clearTimeout(timer);
    }
    lastShownRef.current = null;
    return undefined;
  }, [stableThread, thread]);

  // How the content changes hands (readerVariants): whether the email going
  // out was archived / trashed, and which way the reader moved through the
  // list, measured on the list as it was while that email was still in it.
  // Only from one email to another: opening from the list keeps the reader's
  // content mounted and shows the email at once (it used to swap an empty
  // placeholder out first, then fade in), and closing simply empties it.
  const listOrderRef = useRef<string[]>([]);
  const [hands, setHands] = useState<{
    id: string | null;
    key: string;
    transition: ReaderTransition;
  }>({ id: null, key: 'reader', transition: { advance: false, direction: 1 } });
  if (hands.id !== shownId) {
    const outgoing = hands.id;
    const switching = !!outgoing && !!shownId;
    const order = listOrderRef.current;
    const from = outgoing ? order.indexOf(outgoing) : -1;
    const to = shownId ? order.indexOf(shownId) : -1;
    // Adjusting state while rendering: React re-renders before committing.
    setHands({
      id: shownId,
      key: switching && shownId ? shownId : hands.key,
      transition: switching
        ? {
            advance:
              !!outgoing && (!!exitIntents[outgoing] || leavingThreadIdRef.current === outgoing),
            direction: from !== -1 && to !== -1 && to < from ? -1 : 1
          }
        : hands.transition
    });
  }
  const readerTransition = hands.transition;

  useEffect(() => {
    const update = () => {
      const ids = store.get(filteredThreadIdsAtom);
      if (shownId && ids.includes(shownId)) listOrderRef.current = ids;
    };
    update();
    return store.sub(filteredThreadIdsAtom, update);
  }, [store, shownId]);

  const displayedItems: ThreadItemBase[] = useMemo(() => thread?.items ?? [], [thread]);
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isPrinting, setIsPrinting] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const promiseResolveRef = useRef<(() => void) | null>(null);
  const fullThreadFetchesRef = useRef<Set<string>>(new Set());
  const fullThreadFetchCompletedRef = useRef<Set<string>>(new Set());
  // Full-body fetch for the open thread: drives the body skeleton and a
  // "Couldn't load" notice with retry (a failure used to leave a blank sheet).
  const [bodyFetch, setBodyFetch] = useState<{
    threadId: string;
    fetchKey: string;
    state: 'loading' | 'error';
  } | null>(null);
  const [bodyFetchAttempt, setBodyFetchAttempt] = useState(0);
  const { inlineDrafts } = useComposeInlineAtom();
  const { trackEvent } = useUserTrackingData();

  const [, setIsMessageListFocused] = useState(false);

  // Refs for message cards & inline drafts
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // One ref callback per message, so the memoised cards keep their props.
  const messageRefCallbacks = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const messageRefFor = useCallback((messageId: string) => {
    let callback = messageRefCallbacks.current.get(messageId);
    if (!callback) {
      callback = (el) => {
        if (el) messageRefs.current[messageId] = el;
        else delete messageRefs.current[messageId];
      };
      messageRefCallbacks.current.set(messageId, callback);
    }
    return callback;
  }, []);

  // Scroll configuration
  const SCROLL_JUMP_SIZE = 450; // pixels to scroll per key press

  // Smooth scroll function
  const [isScrolling, setIsScrolling] = useState(false);

  // Replace your existing smoothScrollBy function with this improved version
  const smoothScrollBy = useCallback(
    (deltaY: number) => {
      if (!scrollAreaRef.current || isScrolling) return;

      setIsScrolling(true);
      const currentScrollTop = scrollAreaRef.current.scrollTop;
      const newScrollTop = Math.max(0, currentScrollTop + deltaY);

      scrollAreaRef.current.scrollTo({
        top: newScrollTop,
        behavior: 'smooth'
      });

      // Reset scrolling state after animation completes
      // Smooth scroll typically takes ~300-500ms, so we wait a bit longer to be safe
      setTimeout(() => {
        setIsScrolling(false);
      }, 400);
    },
    [isScrolling]
  );

  // Hotkey handlers for smooth scrolling
  useHotkeys(
    'shift+up',
    (e) => {
      e.preventDefault();
      smoothScrollBy(-SCROLL_JUMP_SIZE);
    },
    {
      enabled: !!activeThreadId,
      preventDefault: true,
      scopes: ['CONVERSATION_DISPLAY']
    }
  );

  useHotkeys(
    'shift+down',
    (e) => {
      e.preventDefault();
      smoothScrollBy(SCROLL_JUMP_SIZE);
    },
    {
      enabled: !!activeThreadId,
      preventDefault: true,
      scopes: ['CONVERSATION_DISPLAY']
    }
  );

  // Space / Shift+Space / Page Down / Page Up page through the open email, as
  // in a browser. They step aside when the key already has a job (a focused
  // button, field or menu — Space presses buttons) or compose is open. A
  // message card the arrow keys landed on doesn't count: Space still pages.
  const pageScroll = useCallback(
    (direction: 1 | -1) => (e: KeyboardEvent) => {
      const onMessageCard =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.hasAttribute('data-message-card');
      if ((onMessageCard ? isOverlayOpen() : focusedElementOwnsKey()) || isComposeExpanded()) {
        return;
      }
      const viewport = scrollAreaRef.current;
      if (!viewport) return;
      e.preventDefault();
      viewport.scrollBy({ top: direction * viewport.clientHeight * 0.85, behavior: 'smooth' });
    },
    []
  );
  useHotkeys('space, pagedown', pageScroll(1), {
    enabled: !!activeThreadId,
    scopes: ['CONVERSATION_DISPLAY']
  });
  useHotkeys('shift+space, pageup', pageScroll(-1), {
    enabled: !!activeThreadId,
    scopes: ['CONVERSATION_DISPLAY']
  });

  // Focus management for message list
  const handleMessageListFocus = useCallback(() => {
    setIsMessageListFocused(true);
  }, []);

  const handleMessageListBlur = useCallback(() => {
    setIsMessageListFocused(false);
  }, []);

  // Keyboard event handler for the scroll area to detect focus
  const handleScrollAreaKeyDown = useCallback((e: React.KeyboardEvent) => {
    // This ensures the scroll area can receive focus and keyboard events
    // Not while typing (the quick reply): Shift+arrows select text there.
    const target = e.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest('input, textarea')) return;
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setIsMessageListFocused(true);
    }
  }, []);

  // Mark the open email read, 200 ms after it was last shown unread (a partial
  // and a full thread landing in quick succession make one request). Per
  // thread: stepping on with J / K within 200 ms must still mark each one.
  const readDepsRef = useRef({ unmarkThreadsAsUnread, trackEvent, t });
  readDepsRef.current = { unmarkThreadsAsUnread, trackEvent, t };
  const readTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const readMessages = useCallback((target: MonoThread) => {
    const timers = readTimersRef.current;
    clearTimeout(timers.get(target.id));
    timers.set(
      target.id,
      setTimeout(() => {
        timers.delete(target.id);
        const targetThread = target;
        const deps = readDepsRef.current;
        try {
          if (targetThread.labelIds.includes('UNREAD')) {
            deps.unmarkThreadsAsUnread(targetThread.accountId, [targetThread.id]);

            // Banners are keyed mail:<account>:<thread> (pushHandler).
            if (isElectron) {
              electronApi.closeNativeNotification(
                `mail:${targetThread.accountId}:${targetThread.id}`
              );
            }

            deps.trackEvent('email_read', {
              thread_id: targetThread.id,
              sender: targetThread.from.length > 0 ? targetThread.from[0].email : 'unknown',
              subject: targetThread.subject,
              has_attachments: Object.keys(targetThread.attachments).length > 0,
              email_length: targetThread.snippet?.length,
              time_to_read: Date.now() - targetThread.timestamp,
              labels: targetThread.labelIds.join(',')
            });
          }
        } catch (error) {
          console.error('Error fetching thread:', error);
          toast.error(deps.t('toast.error.fetch_thread'));
        }
      }, 200)
    );
  }, []);
  useEffect(() => {
    const timers = readTimersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);
  const readThreadIdRef = useRef<string | null>(null);
  const readItemCountRef = useRef(0);
  useEffect(() => {
    // Closing the reader resets this, so reopening the same email (after U
    // marked it unread) reads it again.
    if (!stableThread) {
      readThreadIdRef.current = null;
      return;
    }
    // Only when a thread opens. Label changes give the open thread a new
    // object (relabelThread), so re-running for any unread thread undid U
    // (mark unread) on the open email 200 ms later.
    // A reply arriving while it is open is read too (more messages than before).
    const isNewThread = readThreadIdRef.current !== stableThread.id;
    const hasNewMessage = stableThread.items.length > readItemCountRef.current;
    readThreadIdRef.current = stableThread.id;
    readItemCountRef.current = stableThread.items.length;
    if (isNewThread || (hasNewMessage && stableThread.labelIds.includes('UNREAD'))) {
      readMessages(stableThread);
    }
  }, [stableThread]);

  // Load full message bodies when the cached thread is metadata-only. We do
  // NOT abort this on effect re-runs: an aborted fetch silently leaves the
  // body empty, and the in-flight guard below already prevents duplicate
  // fetches for the same thread.
  const needsBody =
    !!stableThread?.accountId &&
    !isComposeDraftId(stableThread.id) &&
    threadNeedsFullBody(stableThread);
  const fetchKey =
    needsBody && stableThread
      ? `${stableThread.accountId}:${stableThread.id}:${stableThread.historyId ?? ''}`
      : null;
  const stableThreadRef = useRef(stableThread);
  stableThreadRef.current = stableThread;

  useEffect(() => {
    const target = stableThreadRef.current;
    if (!fetchKey || !target?.accountId) return;
    if (fullThreadFetchCompletedRef.current.has(fetchKey)) return;
    const fetchThreadId = target.id;
    // Set while rendering this thread's first commit: the skeleton shows on a
    // cold open, and a failure shows the notice (both were reset in the same
    // commit before, so neither ever appeared).
    setBodyFetch({ threadId: fetchThreadId, fetchKey, state: 'loading' });
    if (fullThreadFetchesRef.current.has(fetchKey)) return;
    fullThreadFetchesRef.current.add(fetchKey);
    let completed = false;
    const accountId = target.accountId;
    const startedAt = performance.now();

    // Shared with hover prefetch: if the pointer already rested on this row,
    // this awaits that in-flight request instead of starting over.
    fetchFullThread(accountId, fetchThreadId, {
      cached: target,
      // Long threads: show the newest message as soon as it arrives. Memory
      // only; the full thread that follows is persisted.
      onPartial: (partial) => {
        markReaderPhase('newest message arrived', fetchThreadId);
        void updateThread(accountId, partial, false);
        markReaderPhase('store updated (newest message)', fetchThreadId);
      }
    })
      .then((fullThread) => {
        completed = true;
        if (import.meta.env.DEV) {
          // How long the open waited on the network (near 0 when a prefetch
          // already had it): the number to watch when the reader feels slow.
          log.debug(
            `[reader] body for ${fetchThreadId} in ${Math.round(performance.now() - startedAt)} ms`
          );
        }
        markReaderPhase('body arrived', fetchThreadId);
        // Memory first, so the reader draws the bodies in the next render;
        // IndexedDB after that frame is painted.
        void updateThread(accountId, fullThread, false);
        markReaderPhase('store updated', fetchThreadId);
        setBodyFetch((prev) => (prev?.fetchKey === fetchKey ? null : prev));
        persistAfterPaint(accountId, fullThread);
      })
      .catch((error) => {
        console.error('Failed to fetch full thread body:', error);
        setBodyFetch((prev) =>
          prev?.fetchKey === fetchKey ? { threadId: fetchThreadId, fetchKey, state: 'error' } : prev
        );
      })
      .finally(() => {
        fullThreadFetchesRef.current.delete(fetchKey);
        if (completed) {
          fullThreadFetchCompletedRef.current.add(fetchKey);
        }
      });
  }, [fetchKey, bodyFetchAttempt]);

  useEffect(() => {
    if (import.meta.env.DEV && stableThread && !needsBody) {
      log.debug(`[reader] body for ${stableThread.id} already loaded`);
    }
  }, [stableThread?.id]);

  // Load the full text of the email Done / Trash move on to once this one has
  // loaded, so the hand-over lands on a complete email, not a preview that
  // redraws when its body arrives. Once per thread, like the list's prefetch.
  const openBodyLoading = bodyFetch?.state === 'loading';
  const nextPrefetchedRef = useRef(new Set<string>());
  useEffect(() => {
    if (openBodyLoading || !nextThreadId || nextPrefetchedRef.current.has(nextThreadId)) return;
    const timer = setTimeout(() => {
      const next = store.get(threadsMapAtom)[nextThreadId];
      const accountId = next?.accountId;
      if (!next || !accountId || isComposeDraftId(next.id) || !threadNeedsFullBody(next)) return;
      nextPrefetchedRef.current.add(next.id);
      fetchFullThread(accountId, next.id, { cached: next })
        .then((fullThread) => {
          void updateThread(accountId, fullThread, false);
          persistAfterPaint(accountId, fullThread);
        })
        // Opening it fetches again, with its own notice on failure.
        .catch(() => nextPrefetchedRef.current.delete(next.id));
    }, 300);
    return () => clearTimeout(timer);
  }, [nextThreadId, openBodyLoading]);

  const retryBodyFetch = useCallback(() => {
    setBodyFetch((prev) => {
      if (prev) {
        fullThreadFetchesRef.current.delete(prev.fetchKey);
        fullThreadFetchCompletedRef.current.delete(prev.fetchKey);
      }
      return null;
    });
    // Re-runs the fetch effect.
    setBodyFetchAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (isPrinting && promiseResolveRef.current) {
      promiseResolveRef.current();
    }
  }, [isPrinting]);

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    onBeforePrint: () => {
      return new Promise<void>((resolve) => {
        promiseResolveRef.current = resolve;
        setIsPrinting(true);
      });
    },
    onAfterPrint: () => {
      promiseResolveRef.current = null;
      setIsPrinting(false);
    }
  });

  const orderedItems = useMemo(() => {
    const messages: MonoMessage[] = [];
    const messageDraftMap: Record<string, MonoDraft> = {};
    const unlinkedDrafts: ThreadItemBase[] = [];
    const messageIds = new Set(
      displayedItems.filter((item) => item.type === 'message').map((item) => item.id)
    );

    displayedItems.forEach((item) => {
      if (item.type === 'message') {
        messages.push(item as MonoMessage);
      } else if (item.type === 'draft') {
        const draft = item as MonoDraft;
        if (draft.messageId && messageIds.has(draft.messageId)) {
          messageDraftMap[draft.messageId] = draft;
        } else {
          unlinkedDrafts.push(draft);
        }
      }
    });

    Object.values(inlineDrafts).forEach((draft) => {
      if (draft.messageId && messageIds.has(draft.messageId)) {
        messageDraftMap[draft.messageId] = draft;
      } else if (!unlinkedDrafts.some((d) => d.id === draft.id)) {
        unlinkedDrafts.push(draft);
      }
    });

    return { messages, messageDraftMap, unlinkedDrafts };
  }, [displayedItems, inlineDrafts]);
  const messages = orderedItems.messages;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Which messages the conversation opens on (readerExpansion): the newest
  // one with something to read and the newest unread one, not the newest by
  // time (often an empty "Accepted:" reply or your own). Unread as it was
  // when the email was opened: opening marks it read, which must not fold
  // the message away again.
  const unreadAtOpenRef = useRef<{ threadId: string | null; ids: Set<string> }>({
    threadId: null,
    ids: new Set()
  });
  if (unreadAtOpenRef.current.threadId !== shownId) {
    unreadAtOpenRef.current = { threadId: shownId, ids: new Set() };
  }
  for (const message of messages) {
    if (message.labelIds.includes('UNREAD')) unreadAtOpenRef.current.ids.add(message.id);
  }
  const unreadIds = unreadAtOpenRef.current.ids;
  const unreadKey = Array.from(unreadIds).join(',');
  const openMessages = useMemo(() => pickOpenMessages(messages, unreadIds), [messages, unreadKey]);

  // Collapse state is the conversation's: the cards are controlled. What the
  // user toggled (a row, Expand all / Collapse all) overrides the opening
  // choice above; everything else follows it as bodies and messages arrive.
  // Kept per thread, so another email never opens with this one's state.
  const [view, setView] = useState<{
    threadId: string | null;
    collapsedById: Record<string, boolean>;
    historyUnfolded: boolean;
  }>({ threadId: null, collapsedById: NO_OVERRIDES, historyUnfolded: false });
  const viewIsCurrent = view.threadId === shownId;
  const collapsedById = viewIsCurrent ? view.collapsedById : NO_OVERRIDES;
  const historyUnfolded = viewIsCurrent && view.historyUnfolded;
  const updateView = useCallback(
    (
      change: (current: {
        collapsedById: Record<string, boolean>;
        historyUnfolded: boolean;
      }) => Partial<{ collapsedById: Record<string, boolean>; historyUnfolded: boolean }>
    ) =>
      setView((prev) => {
        const threadId = shownIdRef.current;
        const current =
          prev.threadId === threadId
            ? prev
            : { threadId, collapsedById: NO_OVERRIDES, historyUnfolded: false };
        return { ...current, threadId, ...change(current) };
      }),
    []
  );
  const handleCollapsedChange = useCallback(
    (messageId: string, isCollapsed: boolean) =>
      updateView((current) =>
        current.collapsedById[messageId] === isCollapsed
          ? {}
          : { collapsedById: { ...current.collapsedById, [messageId]: isCollapsed } }
      ),
    [updateView]
  );
  const setHistoryUnfolded = useCallback(
    (unfolded: boolean) => updateView(() => ({ historyUnfolded: unfolded })),
    [updateView]
  );
  const isMessageCollapsed = (messageId: string) =>
    !isPrinting && (collapsedById[messageId] ?? !openMessages.expanded.has(messageId));

  const conversation = useMemo(
    () =>
      layoutConversation(
        messages,
        (message) => isMessageCollapsed(message.id),
        (message) => message.id,
        historyUnfolded || isPrinting
      ),
    [messages, collapsedById, openMessages, historyUnfolded, isPrinting]
  );

  // Expand all / Collapse all (`;` / `:`, and the header's More menu).
  const canExpandAll = conversation.some(
    (entry) => entry.kind === 'fold' || isMessageCollapsed(entry.message.id)
  );
  const canCollapseAll = messages.some((message) => !isMessageCollapsed(message.id));
  const handleExpandAll = useCallback(() => {
    updateView(() => ({
      collapsedById: Object.fromEntries(messagesRef.current.map((message) => [message.id, false])),
      historyUnfolded: true
    }));
  }, [updateView]);
  const handleCollapseAll = useCallback(() => {
    updateView(() => ({
      collapsedById: Object.fromEntries(messagesRef.current.map((message) => [message.id, true])),
      historyUnfolded: false
    }));
  }, [updateView]);
  const conversationKeyOptions = {
    enabled: !!activeThreadId,
    scopes: ['CONVERSATION_DISPLAY'],
    // Matched on the character typed (`;`, `:`), whatever the keyboard layout.
    useKey: true,
    ignoreEventWhen: isComposeExpanded
  };
  useHotkeys(
    ';',
    (e) => {
      e.preventDefault();
      handleExpandAll();
    },
    conversationKeyOptions,
    [handleExpandAll]
  );
  useHotkeys(
    ':',
    (e) => {
      e.preventDefault();
      handleCollapseAll();
    },
    conversationKeyOptions,
    [handleCollapseAll]
  );

  // Open on the message to read without a visible scroll. It's pinned in
  // place before the first paint, and again whenever the content resizes
  // (earlier messages arriving from the progressive fetch, avatars, the
  // reader's remount on a thread switch) or the message to read changes as
  // bodies arrive, until the user scrolls, clicks or presses a key.
  const pinnedMessageIdRef = useRef<string | null>(null);
  const pinReleasedRef = useRef(false);
  const pinnedThreadIdRef = useRef<string | null>(null);
  // How many messages were shown when the target was last pinned.
  const pinnedItemCountRef = useRef(0);

  const applyPin = useCallback(() => {
    const messageId = pinnedMessageIdRef.current;
    const viewport = scrollAreaRef.current;
    if (!messageId || !viewport) return;
    const el = messageRefs.current[messageId];
    if (!el || !viewport.contains(el)) return;
    const top =
      viewport.scrollTop +
      el.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top -
      18;
    // When the subject and the history rows above fit comfortably, stay at the
    // top: the whole conversation, the message to read included, is in view.
    viewport.scrollTop = top <= viewport.clientHeight * 0.4 ? 0 : top;
  }, []);

  useEffect(() => {
    const release = () => {
      pinnedMessageIdRef.current = null;
      pinReleasedRef.current = true;
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('wheel', release, opts);
    window.addEventListener('touchstart', release, opts);
    window.addEventListener('pointerdown', release, opts);
    window.addEventListener('keydown', release, opts);
    return () => {
      window.removeEventListener('wheel', release, opts);
      window.removeEventListener('touchstart', release, opts);
      window.removeEventListener('pointerdown', release, opts);
      window.removeEventListener('keydown', release, opts);
    };
  }, []);

  // The content column of the current reader: re-pin whenever it resizes.
  const contentResizeObserverRef = useRef<ResizeObserver | null>(null);
  const contentColumnRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentResizeObserverRef.current?.disconnect();
      contentResizeObserverRef.current = null;
      if (!node) return;
      const observer = new ResizeObserver(() => applyPin());
      observer.observe(node);
      contentResizeObserverRef.current = observer;
    },
    [applyPin]
  );

  const pinTargetId = openMessages.focusId;
  useLayoutEffect(() => {
    if (pinnedThreadIdRef.current !== shownId) {
      // A new email: the click / key that opened it doesn't release its pin.
      pinnedThreadIdRef.current = shownId;
      pinReleasedRef.current = false;
      pinnedMessageIdRef.current = null;
      pinnedItemCountRef.current = 0;
      if (!pinTargetId && scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
    }
    if (!pinTargetId || pinReleasedRef.current) return;
    // Also re-pin when earlier messages were inserted above the target: a
    // folder's cached copy of a conversation often holds just that message,
    // so it was pinned alone and the full fetch pushed it far below the fold.
    if (
      pinnedMessageIdRef.current !== pinTargetId ||
      messages.length > pinnedItemCountRef.current
    ) {
      pinnedItemCountRef.current = messages.length;
      pinnedMessageIdRef.current = pinTargetId;
      applyPin();
    }
  }, [shownId, pinTargetId, messages.length, inlineDrafts]);

  // Dev timing: what DisplayPanel committed for the open email.
  useLayoutEffect(() => {
    if (!thread) return;
    const withBodies = messages.some((message) => payloadHasBodyData(message.payload));
    markReaderPhase(
      withBodies ? 'reader committed with bodies' : 'reader committed (metadata only)',
      thread.id
    );
  }, [thread]);

  useEffect(() => {
    if (activeThreadId) {
      activateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(true);
    } else {
      deactivateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(false);
    }
    setHoldReleasedFor(null);
    // A loading / error state belongs to its thread: drop another thread's,
    // keep the one the fetch effect (which ran first) just set for this one.
    setBodyFetch((prev) => (prev && prev.threadId !== activeThreadId ? null : prev));
  }, [activeThreadId]);

  const bodyLoading = !!thread && bodyFetch?.threadId === thread.id && openBodyLoading;
  // The reader shows an email at once: no entrance fade here (the content's
  // own 100 ms fade covers switches between emails). Closing still fades.
  const readerVisible =
    readerPhase === 'open' || readerPhase === 'opening' || (readerPhase === 'closed' && !!thread);

  return (
    <div
      className={cn(
        'relative flex h-full flex-col bg-white text-foreground transition-colors dark:bg-background',
        thread || readerPhase === 'closing' ? '' : 'opacity-0',
        className
      )}
    >
      <DisplayPanelHeader
        ref={titleRef}
        thread={thread}
        handlePrint={handlePrint}
        isPrinting={isPrinting}
        handleCollapseAll={handleCollapseAll}
        handleExpandAll={handleExpandAll}
        canExpandAll={canExpandAll}
        canCollapseAll={canCollapseAll}
      />
      <div
        className={cn(
          'flex flex-1 transform-gpu overflow-hidden',
          // The reading "desk": a sunken, softly tinted well inset from the
          // app chrome. Message papers (MessageCard) sit on it, so the email
          // no longer blends into the identical white app canvas.
          'mx-3 mb-3 rounded-2xl bg-reader-well',
          // Opening is instant; closing fades out over MailLayout's close
          // timer (280 ms), so the fade completes before the panel collapses.
          // Opacity only: the old scale-in made the email "arrive" ~300 ms
          // after the click. Arbitrary durations: the `duration-` utility is
          // ambiguous next to tailwindcss-animate's animation duration.
          'transition-opacity ease-out motion-reduce:transition-none',
          readerVisible
            ? 'opacity-100 [transition-duration:0ms]'
            : 'opacity-0 [transition-duration:280ms]'
        )}
      >
        {/* An email archived / trashed from the reader is put away and the
            next one rises into its place (readerVariants). mode="wait": one
            ScrollArea at a time, so its refs stay valid. */}
        <AnimatePresence mode="wait" initial={false} custom={readerTransition}>
          <motion.div
            key={hands.key}
            custom={readerTransition}
            variants={readerVariants(!!reduceMotion)}
            initial="enter"
            animate="present"
            exit="exit"
            className="flex min-h-0 min-w-0 flex-1"
          >
            <ScrollArea
              viewportRef={scrollAreaRef}
              className="relative flex-1"
              // The thumb shows while scrolling (macOS-style) so a long email
              // hints how much is left; always-hidden gave no sense of length.
              type="scroll"
              scrollbarClassName={'transition-opacity data-[state=hidden]:opacity-0'}
              style={{
                maskImage:
                  'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 24px), transparent)'
              }}
              onFocus={handleMessageListFocus}
              onBlur={handleMessageListBlur}
              onKeyDown={handleScrollAreaKeyDown}
              tabIndex={0} // Make the scroll area focusable
            >
              <div ref={contentColumnRef} className="mx-auto max-w-[920px] px-6 pb-16">
                {/* Printed: the subject and the whole conversation. */}
                <div className={cn('flex flex-1 flex-col')} ref={printRef}>
                  {thread && (
                    // Tighter above (mt-5 clears the 16px fade at the top of
                    // the scroll area) so the email starts higher; the labels
                    // sit beside the subject, out of the toolbar.
                    <div className="mb-4 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h1
                        className="select-text text-foreground"
                        style={{
                          fontSize: '24px',
                          fontWeight: 650,
                          letterSpacing: '0',
                          lineHeight: '1.3'
                        }}
                      >
                        {!thread.subject || thread.subject === ''
                          ? t('header.display.no_subject')
                          : thread.subject}
                      </h1>
                      <ThreadLabelBadges thread={thread} className="print:hidden" />
                    </div>
                  )}
                  {thread && bodyFetch?.threadId === thread.id && bodyFetch.state === 'error' && (
                    <div
                      role="alert"
                      className="-mt-2 mb-4 flex items-center gap-2 text-sm text-muted-foreground print:hidden"
                    >
                      <MonoIcon type="AlertCircle" className="h-4 w-4 text-destructive" />
                      {t('display_panel.load_error', {
                        defaultValue: 'Couldn’t load this conversation.'
                      })}
                      <Button variant="ghost" sizeVariant="sm" onClick={retryBodyFetch}>
                        {t('thread_list.try_again')}
                      </Button>
                    </div>
                  )}
                  {conversation.map((entry, index) => {
                    // Rows continuing a stack sit flush against the one above.
                    const spacing =
                      entry.stack === 'middle' || entry.stack === 'last' ? '' : 'mt-3 first:mt-0';

                    if (entry.kind === 'fold') {
                      return (
                        <button
                          key={entry.key}
                          onClick={() => setHistoryUnfolded(true)}
                          aria-expanded={false}
                          className={cn(
                            'group/fold flex w-full items-center gap-2.5 border border-t-0 border-foreground/[0.06] bg-card px-4 py-2.5 text-left text-[13px] text-muted-foreground transition-colors pointer-hover:bg-foreground/[0.025] pointer-hover:text-foreground sm:px-5',
                            'dark:border-white/[0.06] dark:pointer-hover:bg-foreground/[0.04]',
                            ringVariants,
                            spacing
                          )}
                        >
                          {/* The count sits in the avatar column, so the line reads
                              like the rows around it: "(6) earlier messages". */}
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-background text-[11px] font-medium tabular-nums text-foreground/80 transition-colors group-hover/fold:border-foreground/20">
                            {entry.hidden.length}
                          </span>
                          <span>
                            {t('message_card.earlier_messages', { count: entry.hidden.length })}
                          </span>
                          <MonoIcon
                            type={'unfold_more'}
                            className="h-4 w-4 opacity-60 transition-opacity group-hover/fold:opacity-100"
                          />
                        </button>
                      );
                    }

                    const message = entry.message;
                    const isLastMessage = index === conversation.length - 1;
                    const relatedDraft = orderedItems.messageDraftMap[message.id];

                    return (
                      <MessageCard
                        ref={messageRefFor(message.id)}
                        key={message.id}
                        item={message}
                        isLastCard={isLastMessage}
                        accountId={thread?.accountId}
                        collapsed={isMessageCollapsed(message.id)}
                        stack={entry.stack}
                        onCollapsedChange={handleCollapsedChange}
                        draft={relatedDraft}
                        className={spacing}
                        zIndex={conversation.length - index}
                        cardClassName="h-fit"
                        bodyLoading={bodyLoading}
                        isPrinting={isPrinting}
                      />
                    );
                  })}
                </div>
                {orderedItems.unlinkedDrafts.map((draft) => (
                  <div key={draft.id} className="mt-3">
                    <DraftCard item={draft as MonoDraft} />
                  </div>
                ))}
                {/* Reply / Reply all / Forward under the conversation (outside
                    the printed area). Not while a draft is already open in
                    this thread: continuing it is the next step then. */}
                {thread &&
                  !isComposeDraftId(thread.id) &&
                  messages.length > 0 &&
                  orderedItems.unlinkedDrafts.length === 0 &&
                  // Any reply draft in it, not only one under the last message:
                  // a draft kept from the quick reply answers the latest message
                  // from someone else, which needn't be the last.
                  Object.keys(orderedItems.messageDraftMap).length === 0 && (
                    <ThreadReplyBar thread={thread} className="mt-4" />
                  )}
              </div>
            </ScrollArea>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
