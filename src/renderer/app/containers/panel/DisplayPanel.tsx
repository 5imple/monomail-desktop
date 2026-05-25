import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import mailApi from '@/main/api/mail/mailApi';
import DraftCard from '@/renderer/app/components/card/DraftCard';
import MessageCard from '@/renderer/app/components/card/MessageCard';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import DisplayPanelHeader from '@/renderer/app/containers/header/DisplayPanelHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useComposeInlineAtom } from '@/renderer/app/store/compose/useComposeInlineAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { differenceInDays } from 'date-fns';
import { debounce, isEqual } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReactToPrint } from 'react-to-print';
import { toast } from 'sonner';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';

interface DisplayPanelProps {
  className?: string;
  readerPhase?: 'closed' | 'opening' | 'open' | 'closing';
}

export const DisplayPanel = ({ className, readerPhase = 'closed' }: DisplayPanelProps) => {
  const { globalSearchQuery } = useGlobalAtom();
  const { labelsMapByAccount, getAllLabels } = useLabelAtom();
  const { activeThreadId, threadsMap } = useThreadAtom();
  const { unmarkThreadsAsUnread, addLabelToThread } = useThreadLabelAtom();
  const { updateThread, updateThreadState } = useThreadOperationAtom();
  const { t } = useTranslation();

  const [thread, setThread] = useState<MonoThread | null>(null);

  const [displayedItems, setDisplayedMessages] = useState<ThreadItemBase[]>([]);
  const { activateScope, deactivateScope } = useHotkeyScope();
  const [isPrinting, setIsPrinting] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const { member, accounts } = useAuth();
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const composeCardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const promiseResolveRef = useRef<(() => void) | null>(null);
  const fullThreadFetchesRef = useRef<Set<string>>(new Set());
  const fullThreadFetchCompletedRef = useRef<Set<string>>(new Set());
  const [spacerHeight, setSpacerHeight] = useState(0);
  const { removeDraft, sendDraftQueue } = useDraftAtom();
  const executeCommand = useExecuteCommand();
  const { inlineDrafts } = useComposeInlineAtom();
  const { trackEvent } = useUserTrackingData();

  // Focus tracking
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [isMessageListFocused, setIsMessageListFocused] = useState(false);

  // Refs for message cards & inline drafts
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const inlineDraftRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll configuration
  const SCROLL_JUMP_SIZE = 450; // pixels to scroll per key press

  const isOlderThan365Days = thread
    ? differenceInDays(new Date(), new Date(thread.timestamp)) > 365
    : false;

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
      enabled: isMessageListFocused && !!activeThreadId,
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
      enabled: isMessageListFocused && !!activeThreadId,
      preventDefault: true,
      scopes: ['CONVERSATION_DISPLAY']
    }
  );

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
      toast.error(t('toast.error.thread_fetch'));
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
      toast.error(t('toast.error.thread_fetch'));
    }
  }, 200);

  // Create a stable thread reference to prevent unnecessary re-renders of child components
  const stableThread = useMemo(() => {
    if (!activeThreadId) return null;
    return threadsMap[activeThreadId] || null;
  }, [activeThreadId, threadsMap]);

  const payloadHasBodyData = useCallback((payload: MonoMessage['payload']): boolean => {
    if (payload.body?.data) return true;
    return payload.parts?.some(payloadHasBodyData) ?? false;
  }, []);

  const threadNeedsFullBody = useCallback(
    (targetThread: MonoThread): boolean => {
      const messages = targetThread.items.filter(
        (item): item is MonoMessage => item.type === 'message'
      );

      return (
        messages.length === 0 || messages.some((message) => !payloadHasBodyData(message.payload))
      );
    },
    [payloadHasBodyData]
  );

  useEffect(() => {
    if (!stableThread) {
      if (readerPhase === 'closing') return;
      setDisplayedMessages([]);
      setThread(null);
      return;
    }

    if (!scrollAreaRef.current) return;
    displayMessages(stableThread);

    let abortFullThreadFetch: (() => void) | undefined;

    if (threadNeedsFullBody(stableThread) && stableThread.accountId) {
      const fetchKey = `${stableThread.accountId}:${stableThread.id}:${stableThread.historyId ?? ''}`;
      if (
        !fullThreadFetchesRef.current.has(fetchKey) &&
        !fullThreadFetchCompletedRef.current.has(fetchKey)
      ) {
        fullThreadFetchesRef.current.add(fetchKey);
        const abortController = new AbortController();
        let completed = false;
        abortFullThreadFetch = () => abortController.abort();

        mailApi
          .getThread(stableThread.accountId, stableThread.id, abortController.signal)
          .then((response) => {
            if (abortController.signal.aborted) return;
            const fullThread = MonoThread.fromPlainObject(response);
            completed = true;
            updateThread(stableThread.accountId, fullThread);
          })
          .catch((error) => {
            if (!abortController.signal.aborted) {
              console.error('Failed to fetch full thread body:', error);
            }
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

    return abortFullThreadFetch;
  }, [stableThread, readerPhase]);

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

  const calculateSpacerHeight = useCallback(() => {
    if (
      lastMessageRef.current &&
      scrollAreaRef.current &&
      titleRef.current &&
      composeCardRef.current
    ) {
      const lastMessageHeight = lastMessageRef.current.offsetHeight;
      const scrollAreaHeight = scrollAreaRef.current.offsetHeight;
      const titleHeight = titleRef.current.offsetHeight;

      const padding = 18;
      const newSpacerHeight = Math.max(
        scrollAreaHeight - lastMessageHeight - titleHeight - padding,
        0
      );
      setSpacerHeight(newSpacerHeight);
    }
  }, [lastMessageRef.current]);

  const hotkeyHandlers = useMemo(() => {
    if (!thread) return [];

    const accountId = thread.accountId;
    const accountLabels = labelsMapByAccount[accountId] || {};

    const availableLabels = Object.values(accountLabels).filter((label) =>
      label.id.startsWith('Label_')
    );

    return Array.from({ length: 9 }).map((_, index) => ({
      key: `T+${index + 1}`,
      handler: () => availableLabels[index] && handleLabelAdd(availableLabels[index].id),
      enabled: index < availableLabels.length
    }));
  }, [labelsMapByAccount, thread]);

  // hotkeyHandlers.forEach(({ key, handler, enabled }) => {
  //   useHotkeys(key, handler, { enabled, preventDefault: true, scopes: ['CONVERSATION_DISPLAY'] });
  // });

  const handleLabelAdd = async (labelId: string) => {
    if (!thread) return;

    const accountId = thread.accountId;
    if (!accountId) {
      console.error('No accountId found for thread', thread.id);
      return;
    }

    if (thread.labelIds.includes(labelId)) return;
    try {
      updateThreadState(accountId, thread.id, [labelId], [], true);
      await addLabelToThread(accountId, [thread.id], labelId);

      const accountLabels = labelsMapByAccount[accountId] || {};
      const labelName = accountLabels[labelId]?.name || 'Unknown Label';

      toast.success(`Added label: ${labelName}`);
    } catch (error) {
      console.error(`Failed to add label ${labelId} to thread ${thread.id}`, error);
    }
  };

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

  useEffect(() => {
    // You can decide if you want to *always* reset focus to the last message
    // or only if there's no existing focus.
    if (displayedItems.length > 0) {
      const last = displayedItems[displayedItems.length - 1];
      if (last && last.type === 'message' && focusedMessageId !== last.id) {
        setFocusedMessageId(last.id);
        focusMessageCard(last.id);
      }
    }
  }, [displayedItems, inlineDrafts]);

  // 4) Unified function to handle focusing (with optional inline-draft logic)
  const focusMessageCard = (messageId: string) => {
    setFocusedMessageId(messageId);
    // Next tick: scroll into view if possible
    setTimeout(() => {
      // If there's an inline draft for this message, focus that container
      const draftEl = inlineDraftRefs.current[messageId];
      if (draftEl && scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
          top: draftEl.offsetTop - 18,
          behavior: 'smooth'
        });
        // draftEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        // Potentially also focus the input
        // const inputField = draftEl.querySelector('textarea, input');
        // if (inputField) (inputField as HTMLTextAreaElement).focus();
        return;
      }

      // Otherwise, scroll to the message card
      const messageEl = messageRefs.current[messageId];
      if (messageEl && scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
          top: messageEl.offsetTop - 18,
          behavior: 'smooth'
        });
        // messageEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 300);
  };

  useEffect(() => {
    if (activeThreadId) {
      activateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(true);
    } else {
      deactivateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(false);
    }
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTo({ top: 0, behavior: 'instant' });
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
          'flex flex-1 overflow-hidden'
          // scrollAreaRef.current &&
          //   scrollAreaRef.current.clientWidth < 700 &&
          //   scrollAreaRef.current.offsetWidth > 0 &&
          //   'flex-col-reverse'
        )}
      >
        <ScrollArea
          viewportRef={scrollAreaRef}
          className="relative flex-1"
          scrollbarClassName={'opacity-0'}
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent, black 16px, black calc(100% - 24px), transparent)'
          }}
          onFocus={handleMessageListFocus}
          onBlur={handleMessageListBlur}
          onKeyDown={handleScrollAreaKeyDown}
          tabIndex={0} // Make the scroll area focusable
        >
          <div className="mx-auto max-w-[920px] px-6 pb-16">
            {thread && (
              <h1
                className="mb-5 mt-8 text-foreground"
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
            <div className={cn('flex flex-1 flex-col gap-3')} ref={printRef}>
              {orderedItems.messages.map((message, index) => {
                const isLastMessage = index === orderedItems.messages.length - 1;
                const relatedDraft = orderedItems.messageDraftMap[message.id];

                return (
                  <MessageCard
                    ref={(el) => (messageRefs.current[message.id] = el)}
                    key={message.id}
                    item={message as MonoMessage}
                    isLastCard={isLastMessage}
                    accountId={thread?.accountId}
                    collapsed={!isLastMessage}
                    draft={relatedDraft}
                    className={cn('transition-all duration-300 ease-bouncy-in-out')}
                    style={{
                      zIndex: `${orderedItems.messages.length - index}`
                    }}
                    cardClassName={cn('transition-all h-fit')}
                    isFocused={focusedMessageId === message.id}
                    onFocusRequest={() => setFocusedMessageId(message.id)}
                  />
                );
              })}
              {orderedItems.unlinkedDrafts.map((draft) => (
                <div key={draft.id}>
                  <DraftCard
                    item={draft as MonoDraft}
                    className={cn('transition-all duration-300 ease-bouncy-in-out')}
                  />
                </div>
              ))}
              <div style={{ height: spacerHeight }} />
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};
