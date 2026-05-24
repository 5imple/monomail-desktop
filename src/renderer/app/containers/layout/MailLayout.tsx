import { apiClient } from '@/main/api/apiClient';
import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoRecipient } from '@/main/models/types';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/renderer/app/components/ui/resizable';
import { DisplayPanel } from '@/renderer/app/containers/panel/DisplayPanel';
import ListPanel from '@/renderer/app/containers/panel/ListPanel';
import CalendarPanel from '@/renderer/app/containers/panel/CalendarPanel';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useThreadListAtom } from '@/renderer/app/store/layout/threadList/useThreadListAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpacePinAtom } from '@/renderer/app/store/space/pin/useSpacePinAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import {
  Active,
  defaultDropAnimationSideEffects,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DropAnimation,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPanelElement } from 'react-resizable-panels';

interface ThreadData {
  from: MonoRecipient;
}

type ActiveDragItem = Active & {
  data: {
    current: ThreadData;
  };
};

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        // opacity: 0.5
        transform: 'scale(1)'
      }
    }
  })
};

const PANEL_SIZE_STORAGE_KEY = 'resizable-panels:panel:display';

const DragOverlayContent = React.memo(
  ({ activeDragItem }: { activeDragItem: ActiveDragItem | null }) => {
    if (!activeDragItem || !activeDragItem.id.toString().startsWith('thread-contact-')) {
      return null;
    }

    return (
      <div className={cn('flex cursor-default flex-col items-center rounded-md p-2')}>
        <div
          className={cn(
            'relative rounded-full border-2 p-0.5 transition-all duration-300',
            'scale-105 shadow-xl'
          )}
        >
          <RecipientAvatar
            className="h-10 w-10 border"
            recipient={activeDragItem.data.current.from}
          />
        </div>
        <div className="max-w-12 overflow-hidden text-ellipsis">
          <span className="whitespace-nowrap text-xs">
            {activeDragItem.data.current.from.name.split(' ')[0] ??
              activeDragItem.data.current.from.email}
          </span>
        </div>
      </div>
    );
  }
);

DragOverlayContent.displayName = 'DragOverlayContent';

interface MailLayoutProps {}

type ReaderPanelPhase = 'closed' | 'opening' | 'open' | 'closing';

const READER_PANEL_TRANSITION_MS = 280;

export function MailLayout({}: MailLayoutProps) {
  const { notificationAlert, setNotificationAlert } = useThreadListAtom();
  const { pinEmailInSpace } = useSpacePinAtom();
  const { activeThreadId } = useThreadAtom();
  const { preference } = useAuth();
  const { globalSearchQuery, fullscreenDisplayPanel, setFullscreenDisplayPanel } = useGlobalAtom();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor)
  );
  const [activeDragItem, setActiveDragItem] = useState<ActiveDragItem | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveDragItem(active as ActiveDragItem);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    // Reset active drag item

    if (
      (active as ActiveDragItem).id.toString().startsWith('thread-contact-') &&
      over &&
      over.id === 'pin-header'
    ) {
      // The item is a thread being dropped onto the contact header
      const recipient = (active as ActiveDragItem).data.current.from;

      // const contactData: Contact = {
      //   contactId: `contact-${thread.from[0].email}`,
      //   emailAddress: thread.from[0].email,
      //   displayName: thread.from[0].name,
      //   flags: [],
      //   lastReceivedMessageTimestamp: Date.now(),
      //   lastSentMessageTimestamp: Date.now(),
      //   messagesReceived: 0,
      //   messagesSent: 0,
      //   normalizedEmailAddress: thread.from[0].email.toLowerCase(),
      //   threadIds: [thread.id],
      //   pinned: true
      // };

      // Use your contact atom to pin the contact
      await pinEmailInSpace(recipient.email);

      // Skip the drop animation by clearing the active drag item
      setActiveDragItem(null);
      return;
    }
    setActiveDragItem(null);
  };

  const displayPanelRef = useRef<any>(null);
  const threadListRef = useRef<any>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false); // State to track handle dragging
  const [isGroupedPanelExpanded, setIsGroupedPanelExpanded] = useState(false);
  const [readerPanelPhase, setReaderPanelPhase] = useState<ReaderPanelPhase>(
    activeThreadId ? 'open' : 'closed'
  );
  const readerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getLastSavedPanelSize = () => {
    const savedSize = localStorage.getItem(PANEL_SIZE_STORAGE_KEY);
    return savedSize ? parseInt(savedSize, 10) : 70;
  };

  const togglePanels = (expand: boolean) => {
    if (displayPanelRef.current) {
      if (expand) {
        const size = getLastSavedPanelSize();
        displayPanelRef.current.expand(size);
      } else {
        displayPanelRef.current.collapse();
      }
      setIsGroupedPanelExpanded(expand);
    }
  };

  useEffect(() => {
    if (readerCloseTimerRef.current) {
      clearTimeout(readerCloseTimerRef.current);
      readerCloseTimerRef.current = null;
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animationFrameId: number | null = null;

    if (activeThreadId) {
      togglePanels(true);
      setFullscreenDisplayPanel(true);
      if (prefersReducedMotion) {
        setReaderPanelPhase('open');
      } else {
        setReaderPanelPhase('opening');
        animationFrameId = window.requestAnimationFrame(() => {
          setReaderPanelPhase('open');
        });
      }
    } else {
      const finishClosing = () => {
        togglePanels(false);
        setFullscreenDisplayPanel(false);
        setReaderPanelPhase('closed');
      };

      if (readerPanelPhase === 'closed' || prefersReducedMotion) {
        finishClosing();
      } else {
        setReaderPanelPhase('closing');
        readerCloseTimerRef.current = setTimeout(finishClosing, READER_PANEL_TRANSITION_MS);
      }
    }

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [activeThreadId]);

  const { draftsMapByAccount, setDraftsByThread } = useDraftAtom();

  useEffect(() => {
    const threadMapByAccount: Record<string, Record<string, MonoDraft[]>> = {};

    // Process drafts by account
    Object.entries(draftsMapByAccount).forEach(([accountId, accountDrafts]) => {
      if (!threadMapByAccount[accountId]) {
        threadMapByAccount[accountId] = {};
      }

      // Process drafts within each account
      Object.values(accountDrafts).forEach((draft) => {
        const threadId = draft.threadId;
        if (threadId) {
          if (!threadMapByAccount[accountId][threadId]) {
            threadMapByAccount[accountId][threadId] = [];
          }
          threadMapByAccount[accountId][threadId].push(draft);
        }
      });
    });

    setDraftsByThread(threadMapByAccount);
  }, [draftsMapByAccount]);

  const { registerAreaRef } = useKeyboardNavigationContext();

  // Register container refs with navigation system
  useEffect(() => {
    const displayPanel = getPanelElement('display-panel');
    if (displayPanel) {
      registerAreaRef('message-list', displayPanel as HTMLDivElement);
    }
    const listPanel = getPanelElement('thread-list');
    if (listPanel) {
      registerAreaRef('thread-list', listPanel as HTMLDivElement);
    }
  }, []);

  useEffect(() => {
    const setupNotification = async () => {
      await Promise.all(
        Object.entries(preference.notification.watchNotification).map(
          async ([accountId, value]) => {
            if (value !== 'OFF') {
              if (isElectron) {
                await electronApi.setNotificationPreference(accountId, value);
                apiClient.setApiActiveUid(accountId);
                // First, start the notification service (this will setup the watch)
                await electronApi.startNotificationService(accountId);

                // Then, set the notification preference in the SystemManager
                // This ensures the preference is stored for filtering notifications
              }
            } else {
              // Even if notifications are OFF, still set the preference
              if (isElectron) {
                await electronApi.setNotificationPreference(accountId, 'OFF');
              }
            }
          }
        )
      );
    };
    setupNotification();
  }, [preference.notification.watchNotification]);

  const isReaderMounted = readerPanelPhase !== 'closed';
  const isReaderFullscreen = Boolean(activeThreadId) || fullscreenDisplayPanel;
  const isReaderSettledOpen = readerPanelPhase === 'open';
  const isResizeHandleEnabled = isGroupedPanelExpanded && !isReaderFullscreen;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <ResizablePanelGroup
          direction="horizontal"
          dir={'ltr'}
          onLayout={(sizes: number[]) => {
            document.cookie = `resizable-panels:layout=${JSON.stringify(sizes)}`;
          }}
          className="h-full w-full overflow-hidden"
          style={{ overflow: 'visible' }}
        >
          {/* THREAD PANEL */}
          <ResizablePanel
            data-nav-area="thread-list"
            id={'thread-list'}
            ref={threadListRef}
            order={1}
            defaultSize={100}
            style={
              isReaderFullscreen
                ? {
                    flexBasis: '0%',
                    flexGrow: 0,
                    opacity: 0,
                    pointerEvents: 'none'
                    // transition: 'all 300ms ease-in-out'
                  }
                : {}
            }
          >
            <ListPanel />
          </ResizablePanel>

          {/* Grouped Panels Handle */}
          <ResizableHandle
            disabled={!isResizeHandleEnabled}
            tabIndex={isResizeHandleEnabled ? 0 : -1}
            aria-hidden={!isResizeHandleEnabled}
            onDragging={(dragging) => setIsDraggingHandle(dragging)}
            className={cn(
              !isResizeHandleEnabled && 'w-0 bg-transparent after:w-0 after:content-none'
            )}
          />

          {/* DISPLAY PANEL */}
          <ResizablePanel
            data-nav-area="display-panel"
            id="display-panel"
            ref={displayPanelRef}
            order={2}
            defaultSize={0}
            collapsible
            minSize={20}
            // When fullscreenDisplayPanel is true, make the display panel take up 100% width.
            style={{
              willChange: 'flex-grow, flex-basis, opacity, transform',
              ...(isReaderFullscreen
                ? {
                    flexBasis: '100%',
                    flexGrow: 1,
                    opacity: 1
                    // transition: 'all 300ms ease-in-out'
                  }
                : {})
            }}
            onResize={(size) => {
              if (size !== 0) localStorage.setItem(PANEL_SIZE_STORAGE_KEY, size.toString());
            }}
            className={cn(
              'flex transform-gpu transition-[opacity,transform]',
              // 'transition-all ease-in-out will-change-auto'
              isReaderFullscreen ? 'flex-grow basis-[100%]' : '',
              // isDraggingHandle ? 'duration-0' : 'duration-300',
              isDraggingHandle ? 'duration-0' : 'duration-300 ease-bouncy-in-out',
              isGroupedPanelExpanded || isReaderMounted ? 'opacity-100' : 'opacity-0',
              isReaderMounted && !isReaderSettledOpen
                ? 'translate-x-5 scale-[0.995]'
                : 'translate-x-0 scale-100'
            )}
          >
            <DisplayPanel className="flex-1 overflow-hidden" readerPhase={readerPanelPhase} />
            {/* <ContactsExtensionInline className="border-l w-[320px]" /> */}
          </ResizablePanel>
        </ResizablePanelGroup>

        {createPortal(
          <DragOverlay dropAnimation={activeDragItem ? null : dropAnimation}>
            <DragOverlayContent activeDragItem={activeDragItem} />
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </>
  );
}
