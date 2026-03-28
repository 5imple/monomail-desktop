import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { ThreadItemBase } from '@/main/models/thread/ThreadItem';
import { MonoRecipient } from '@/main/models/types';
import { ContactCard } from '@/renderer/app/components/card/ContactCard';
import { AttachmentCard } from '@/renderer/app/components/card/AttachmentCard';
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
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
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
import { Button } from '@/renderer/app/components/ui/button';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';

interface DisplayPanelProps {
  className?: string;
}

export const DisplayPanel = ({ className }: DisplayPanelProps) => {
  const { globalSearchQuery } = useGlobalAtom();
  const { labelsMapByAccount, getAllLabels } = useLabelAtom();
  const { selectedThreads, threadsMap } = useThreadAtom();
  const { unmarkThreadsAsUnread, addLabelToThread } = useThreadLabelAtom();
  const { updateThreadState } = useThreadOperationAtom();
  const { contactDisplayPanel, setContactDisplayPanel } = useGlobalAtom();
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
  const [spacerHeight, setSpacerHeight] = useState(0);
  const { openDialog } = useDialogs();
  const { removeDraft, sendDraftQueue } = useDraftAtom();
  const executeCommand = useExecuteCommand();
  const { inlineDrafts } = useComposeInlineAtom();
  const { getUserPlan, hasActiveSubscription } = useBillingAtom();
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
  const isOlderThan15Days = thread
    ? differenceInDays(new Date(), new Date(thread.timestamp)) > 15
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
      enabled: isMessageListFocused && selectedThreads.length === 1,
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
      enabled: isMessageListFocused && selectedThreads.length === 1,
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
    if (selectedThreads.length !== 1) return null;
    return threadsMap[selectedThreads[0]] || null;
  }, [selectedThreads, threadsMap]);

  useEffect(() => {
    if (!stableThread || !scrollAreaRef.current) return;
    displayMessages(stableThread);

    // Call readMessages if:
    // 1. It's a different thread (thread ID changed)
    // 2. Same thread but it's unread (handles cases where thread was marked unread and reopened)
    const isNewThread = !thread || !isEqual(stableThread.id, thread.id);
    const isUnreadThread = stableThread.labelIds.includes('UNREAD');

    if (isNewThread || isUnreadThread) {
      readMessages(stableThread);
    }
  }, [stableThread]);

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
    if (selectedThreads.length === 1) {
      activateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(true);
    } else {
      deactivateScope('CONVERSATION_DISPLAY');
      setIsMessageListFocused(false);
    }
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTo({ top: 0, behavior: 'instant' });
  }, [selectedThreads]);

  const handleContactToggle = () => {
    setContactDisplayPanel((prev) => !prev);
  };

  const [selectedRecipient, setSelectedRecipient] = useState<MonoRecipient | null>(null);

  // Auto-select first recipient from thread (same logic as ContactCard)

  const handleContactOpen = (recipient: MonoRecipient) => {
    setContactDisplayPanel(true);
    setSelectedRecipient(recipient);
  };

  return (
    <div
      className={cn(
        'relative flex h-full flex-col transition-all',
        thread ? '' : 'opacity-0',
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
        contactToggle={contactDisplayPanel}
        handleContactToggle={handleContactToggle}
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
              'linear-gradient(0deg, transparent 0%, hsl(var(--card)) 0%, hsl(var(--card)) 99%, transparent 100%)'
          }}
          onFocus={handleMessageListFocus}
          onBlur={handleMessageListBlur}
          onKeyDown={handleScrollAreaKeyDown}
          tabIndex={0} // Make the scroll area focusable
        >
          <div
            className={cn(
              'flex flex-1 flex-col gap-6 p-5 pt-2',
              isOlderThan15Days &&
                (getUserPlan() === 'free' || !hasActiveSubscription()) &&
                'blur-xl'
            )}
            ref={printRef}
          >
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
                  contactToggle={contactDisplayPanel}
                  className={cn('transition-all duration-300 ease-bouncy-in-out')}
                  style={{
                    zIndex: `${orderedItems.messages.length - index}`
                  }}
                  cardClassName={cn('transition-all h-fit')}
                  handleContactOpen={handleContactOpen}
                  isFocused={focusedMessageId === message.id}
                  onFocusRequest={() => setFocusedMessageId(message.id)}
                />
              );
            })}
            {orderedItems.unlinkedDrafts.map((draft) => (
              <div key={draft.id}>
                {/* {sendDraftQueue.includes(draft.id) ? ( */}
                <DraftCard
                  item={draft as MonoDraft}
                  className={cn('transition-all duration-300 ease-bouncy-in-out')}
                />
                {/* ) : (
                <InlineComposeCard
                  ref={(el) => {
                    if ((draft as MonoDraft).messageId) {
                      inlineDraftRefs.current[(draft as MonoDraft).messageId] = el;
                    }
                  }}
                  draft={draft as MonoDraft}
                  className={cn('shadow-xl ease-bouncy-in-out')}
                />
              )} */}
              </div>
            ))}
            <div style={{ height: spacerHeight }} />
          </div>
          {/* TODO */}
          {isOlderThan15Days && (getUserPlan() === 'free' || !hasActiveSubscription()) && (
            <div className="absolute bottom-0 left-0 right-0 top-0">
              <div className="my-4 py-8 text-center">
                <div className="mb-2 text-sm text-foreground">
                  {t('display_panel.history_limited', {
                    day: 15
                  })}
                </div>
                <Button
                  sizeVariant={'sm'}
                  variant={'default'}
                  className="text-xs"
                  onClick={() => {
                    openDialog('preference', { defaultPage: 'billing' });
                  }}
                >
                  Upgrade my plan
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
        <div
          className={cn(
            'transition-all duration-300 ease-bouncy-in-out',
            'h-fit',
            contactDisplayPanel ? 'opacity-100' : 'opacity-0',
            contactDisplayPanel
              ? 'mr-5 mt-2 max-w-[320px] translate-x-0'
              : 'mr-0 max-w-0 translate-x-full'
          )}
        >
          <div className="flex flex-col gap-3">
            <ContactCard
              thread={stableThread}
              recipient={selectedRecipient}
              onRecipientChange={setSelectedRecipient}
            />
            <AttachmentCard selectedRecipient={selectedRecipient} thread={stableThread} />
          </div>
        </div>
      </div>
    </div>
  );
};
