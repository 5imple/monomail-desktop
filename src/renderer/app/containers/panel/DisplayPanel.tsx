import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import DraftCard from '@/renderer/app/components/card/DraftCard';
import MessageCard from '@/renderer/app/components/card/MessageCard';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import DisplayPanelHeader from '@/renderer/app/containers/header/DisplayPanelHeader';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { focusedElementOwnsKey } from '@/renderer/app/lib/hotkeyGuards';
import { layoutConversation } from '@/renderer/app/lib/messageHistory';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import { cn } from '@/renderer/app/lib/utils';
import { useComposeInlineAtom } from '@/renderer/app/store/compose/useComposeInlineAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { debounce, isEqual } from 'lodash';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { fetchFullThread, threadNeedsFullBody } from '@/renderer/app/lib/threadBodyPrefetch';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useAtomValue } from 'jotai';
import { threadExitIntentAtom } from '@/renderer/app/store/thread/exitIntentAtom';
import { readerSwipeVariants } from '@/renderer/app/containers/list/threadRowMotion';

interface DisplayPanelProps {
  className?: string;
  readerPhase?: 'closed' | 'opening' | 'open' | 'closing';
}

export const DisplayPanel = ({ className, readerPhase = 'closed' }: DisplayPanelProps) => {
  const { activeThreadId, threadsMap } = useThreadAtom();
  const { unmarkThreadsAsUnread } = useThreadLabelAtom();
  const { updateThread } = useThreadOperationAtom();
  const { t } = useTranslation();

  const [thread, setThread] = useState<MonoThread | null>(null);
  const exitIntents = useAtomValue(threadExitIntentAtom);
  const reduceMotion = useReducedMotion();

  const [displayedItems, setDisplayedMessages] = useState<ThreadItemBase[]>([]);
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isPrinting, setIsPrinting] = useState(false);
  const [, setCollapsed] = useState<boolean>(false);
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

  // Focus tracking
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [, setIsMessageListFocused] = useState(false);

  // Refs for message cards & inline drafts
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
  // button, field or menu — Space presses buttons) or compose is open.
  const pageScroll = useCallback(
    (direction: 1 | -1) => (e: KeyboardEvent) => {
      if (focusedElementOwnsKey() || document.querySelector('[data-compose-expanded="true"]')) {
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
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setIsMessageListFocused(true);
    }
  }, []);

  const displayMessages = (targetThread: MonoThread) => {
    try {
      setDisplayedMessages(targetThread.items);
      setThread(targetThread);
    } catch (error) {
      console.error('Error fetching thread:', error);
      toast.error(t('toast.error.fetch_thread'));
    }
  };

  const readMessages = debounce((targetThread: MonoThread) => {
    try {
      if (targetThread.labelIds.includes('UNREAD')) {
        unmarkThreadsAsUnread(targetThread.accountId, [targetThread.id]);

        if (isElectron) electronApi.closeNativeNotification(targetThread.id);

        trackEvent('email_read', {
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
      toast.error(t('toast.error.fetch_thread'));
    }
  }, 200);

  // Create a stable thread reference to prevent unnecessary re-renders of child components
  const stableThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threadsMap[activeThreadId] || null;
  }, [activeThreadId, threadsMap]);

  useEffect(() => {
    if (!stableThread) {
      if (readerPhase === 'closing') return;
      setDisplayedMessages([]);
      setThread(null);
      return;
    }

    if (!scrollAreaRef.current) return;
    displayMessages(stableThread);

    // Load full message bodies when the cached thread is metadata-only. We do
    // NOT abort this on effect re-runs (readerPhase / threadsMap churn): an
    // aborted fetch silently leaves the body empty, and the in-flight guard
    // below already prevents duplicate fetches for the same thread.
    if (threadNeedsFullBody(stableThread) && stableThread.accountId) {
      const fetchKey = `${stableThread.accountId}:${stableThread.id}:${stableThread.historyId ?? ''}`;
      if (
        !fullThreadFetchesRef.current.has(fetchKey) &&
        !fullThreadFetchCompletedRef.current.has(fetchKey)
      ) {
        fullThreadFetchesRef.current.add(fetchKey);
        let completed = false;
        const fetchThreadId = stableThread.id;
        setBodyFetch({ threadId: fetchThreadId, fetchKey, state: 'loading' });

        // Shared with hover prefetch: if the pointer already rested on this row,
        // this awaits that in-flight request instead of starting over.
        fetchFullThread(stableThread.accountId, stableThread.id, {
          cached: stableThread,
          // Long threads: show the newest message as soon as it arrives.
          onPartial: (partial) => updateThread(stableThread.accountId, partial)
        })
          .then((fullThread) => {
            completed = true;
            updateThread(stableThread.accountId, fullThread);
            setBodyFetch((prev) => (prev?.fetchKey === fetchKey ? null : prev));
          })
          .catch((error) => {
            console.error('Failed to fetch full thread body:', error);
            setBodyFetch((prev) =>
              prev?.fetchKey === fetchKey
                ? { threadId: fetchThreadId, fetchKey, state: 'error' }
                : prev
            );
          })
          .finally(() => {
            fullThreadFetchesRef.current.delete(fetchKey);
            if (completed) {
              fullThreadFetchCompletedRef.current.add(fetchKey);
            }
          });
      }
    }

    // Call readMessages if:
    // 1. It's a different thread (thread ID changed)
    // 2. Same thread but it's unread (handles cases where thread was marked unread and reopened)
    const isNewThread = !thread || !isEqual(stableThread.id, thread.id);
    const isUnreadThread = stableThread.labelIds.includes('UNREAD');

    if (isNewThread || isUnreadThread) {
      readMessages(stableThread);
    }
  }, [stableThread, readerPhase, bodyFetchAttempt]);

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

  const handleCollapseAll = () => {
    setCollapsed(true);
  };

  const handleExpandAll = () => {
    setCollapsed(false);
  };

  // hotkeyHandlers.forEach(({ key, handler, enabled }) => {
  //   useHotkeys(key, handler, { enabled, preventDefault: true, scopes: ['CONVERSATION_DISPLAY'] });
  // });

  const orderedItems = useMemo(() => {
    const messages: ThreadItemBase[] = [];
    const messageDraftMap: Record<string, MonoDraft> = {};
    const unlinkedDrafts: ThreadItemBase[] = [];

    displayedItems.forEach((item) => {
      if (item.type === 'message') {
        messages.push(item);
      } else if (item.type === 'draft') {
        const draft = item as MonoDraft;
        if (
          draft.messageId &&
          thread &&
          thread.items.some((item) => item.type === 'message' && item.id === draft.messageId)
        ) {
          messageDraftMap[draft.messageId] = draft;
        } else {
          unlinkedDrafts.push(draft);
        }
      }
    });

    Object.values(inlineDrafts).forEach((draft) => {
      if (
        draft.messageId &&
        thread &&
        thread.items.some((item) => item.type === 'message' && item.id === draft.messageId)
      ) {
        messageDraftMap[draft.messageId] = draft;
      } else if (!unlinkedDrafts.some((d) => d.id === draft.id)) {
        unlinkedDrafts.push(draft);
      }
    });

    return { messages, messageDraftMap, unlinkedDrafts };
  }, [displayedItems, inlineDrafts]);

  // How many items were shown when the newest message was last focused.
  const focusedItemCountRef = useRef(0);

  // Collapse state each card reports (cards toggle themselves on click), so
  // adjacent collapsed rows can join into one stack. Unreported cards fall
  // back to their initial state: only the newest message starts expanded.
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const handleCollapsedChange = useCallback((messageId: string, isCollapsed: boolean) => {
    setCollapsedById((prev) =>
      prev[messageId] === isCollapsed ? prev : { ...prev, [messageId]: isCollapsed }
    );
  }, []);
  // Long histories fold their middle into an "N earlier messages" row.
  const [historyUnfolded, setHistoryUnfolded] = useState(false);

  const conversation = useMemo(() => {
    const lastId = orderedItems.messages[orderedItems.messages.length - 1]?.id;
    return layoutConversation(
      orderedItems.messages,
      (message) => collapsedById[message.id] ?? message.id !== lastId,
      (message) => message.id,
      historyUnfolded || isPrinting
    );
  }, [orderedItems.messages, collapsedById, historyUnfolded, isPrinting]);

  // Open on the newest message without a visible scroll. It's pinned in place
  // before the first paint, and again whenever the content resizes (earlier
  // messages arriving from the progressive fetch, avatars, the reader's
  // remount on a thread switch) until the user scrolls, clicks or presses a key.
  const pinnedMessageIdRef = useRef<string | null>(null);

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
    // top: the whole conversation, newest email included, is already in view.
    viewport.scrollTop = top <= viewport.clientHeight * 0.4 ? 0 : top;
  }, []);

  useEffect(() => {
    const release = () => {
      pinnedMessageIdRef.current = null;
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

  useLayoutEffect(() => {
    if (displayedItems.length > 0) {
      const last = displayedItems[displayedItems.length - 1];
      if (last && last.type === 'message') {
        // Also re-pin when earlier messages were inserted above an
        // already-focused newest message: a folder's cached copy of a
        // conversation often holds just that message, so we pinned it alone
        // and then the full fetch pushed it far below the fold.
        const grewAboveFocused =
          focusedMessageId === last.id && displayedItems.length > focusedItemCountRef.current;
        if (focusedMessageId !== last.id || grewAboveFocused) {
          focusedItemCountRef.current = displayedItems.length;
          setFocusedMessageId(last.id);
          if (focusedMessageId !== last.id || pinnedMessageIdRef.current === last.id) {
            pinnedMessageIdRef.current = last.id;
            applyPin();
          }
        }
      }
    }
  }, [displayedItems, inlineDrafts]);

  useEffect(() => {
    if (activeThreadId) {
      activateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(true);
    } else {
      deactivateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(false);
      // Forget the focused message on close: reopening the same thread
      // otherwise matched the stale id, skipped the scroll-to-latest, and
      // left the reader at the top of the conversation.
      setFocusedMessageId(null);
      focusedItemCountRef.current = 0;
      pinnedMessageIdRef.current = null;
    }
    setCollapsedById({});
    setHistoryUnfolded(false);
    setBodyFetch(null);
    if (scrollAreaRef.current && !pinnedMessageIdRef.current) {
      scrollAreaRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [activeThreadId]);

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
      />
      <div
        className={cn(
          'flex flex-1 origin-center transform-gpu overflow-hidden',
          // The reading "desk": a sunken, softly tinted well inset from the
          // app chrome. Message papers (MessageCard) sit on it, so the email
          // no longer blends into the identical white app canvas.
          'mx-3 mb-3 rounded-2xl bg-reader-well',
          // Reader enter/exit motion: the content fades + scales from the center
          // (no horizontal translate). 280ms matches MailLayout's close timer so
          // the exit fade completes before the panel unmounts. Header stays put
          // (this wrapper is a sibling of DisplayPanelHeader). motion-reduce off.
          // An arbitrary transition-duration: the `duration-` utility with a
          // 280ms value is ambiguous next to tailwindcss-animate's animation
          // duration, so Tailwind emitted nothing and the fade ran at 150ms.
          'transition-[opacity,transform] ease-out [transition-duration:280ms] motion-reduce:transition-none',
          readerPhase === 'open' ? 'scale-100 opacity-100' : 'scale-[0.985] opacity-0'
        )}
      >
        {/* Swipe the email away when it's archived / trashed from the reader
            (mode="wait": one ScrollArea at a time, so its refs stay valid). */}
        <AnimatePresence mode="wait" initial={false} custom={exitIntents}>
          <motion.div
            key={thread?.id ?? 'empty'}
            variants={readerSwipeVariants(thread?.id ?? '', !!reduceMotion)}
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
                {thread && (
                  <h1
                    className="mb-5 mt-8 select-text text-foreground"
                    style={{
                      fontSize: '24px',
                      fontWeight: 650,
                      letterSpacing: '0',
                      lineHeight: '1.3'
                    }}
                  >
                    {!thread.subject || thread.subject === '' ? '(No subject)' : thread.subject}
                  </h1>
                )}
                {thread && bodyFetch?.threadId === thread.id && bodyFetch.state === 'error' && (
                  <div
                    role="alert"
                    className="-mt-2 mb-4 flex items-center gap-2 text-sm text-muted-foreground"
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
                <div className={cn('flex flex-1 flex-col')} ref={printRef}>
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
                        ref={(el) => (messageRefs.current[message.id] = el)}
                        key={message.id}
                        item={message as MonoMessage}
                        isLastCard={isLastMessage}
                        accountId={thread?.accountId}
                        collapsed={!isLastMessage}
                        stack={entry.stack}
                        onCollapsedChange={(isCollapsed) =>
                          handleCollapsedChange(message.id, isCollapsed)
                        }
                        draft={relatedDraft}
                        className={cn('transition-all duration-300 ease-bouncy-in-out', spacing)}
                        style={{
                          zIndex: `${conversation.length - index}`
                        }}
                        cardClassName={cn('transition-all h-fit')}
                        isFocused={focusedMessageId === message.id}
                        onFocusRequest={() => setFocusedMessageId(message.id)}
                        bodyLoading={
                          bodyFetch?.threadId === thread?.id && bodyFetch?.state === 'loading'
                        }
                      />
                    );
                  })}
                  {orderedItems.unlinkedDrafts.map((draft) => (
                    <div key={draft.id} className="mt-3">
                      <DraftCard
                        item={draft as MonoDraft}
                        className={cn('transition-all duration-300 ease-bouncy-in-out')}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
