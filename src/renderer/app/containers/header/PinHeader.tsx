import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { groupRingVariants, ringVariants } from '@/renderer/app/components/ui/constants';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import RecipientAvatar from '@/renderer/app/components/ui/recipient-avatar';
import { ScrollArea, ScrollBar } from '@/renderer/app/components/ui/scroll-area';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { cn } from '@/renderer/app/lib/utils';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpacePinAtom } from '@/renderer/app/store/space/pin/useSpacePinAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  DropAnimation,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  AnimateLayoutChanges,
  defaultAnimateLayoutChanges,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// Customize animateLayoutChanges
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return defaultAnimateLayoutChanges({ ...args, wasDragging: true });
  }
  return true;
};

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        transform: 'scale(1)'
      }
    }
  })
};

const Trash = ({ id }: { id: string }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { t } = useTranslation();
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col items-center rounded-md p-2 text-destructive transition-colors',
        isOver ? 'bg-destructive/20' : ''
      )}
    >
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 transition-colors',
          isOver ? 'bg-transparent' : ''
        )}
      >
        <MonoIcon type={'Trash'} className="h-4 w-4" />
      </div>
      <div className="max-w-12 overflow-hidden text-ellipsis">
        <span className="whitespace-nowrap text-xs">{t('header.pin.remove')}</span>
      </div>
    </div>
  );
};

interface PinnedEmailItem {
  email: string;
  displayName?: string;
}
export const SortableEmailContact = ({
  selected,
  emailItem,
  onClick,
  togglePinStatus,
  isOverlay = false,
  onNewEmail
}: {
  selected: boolean;
  emailItem: PinnedEmailItem;
  onClick: (e: React.MouseEvent) => void;
  togglePinStatus: () => void;
  onNewEmail: (email: string) => void;
  isOverlay?: boolean;
}) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: emailItem.email,
    animateLayoutChanges
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.5 : 1
  };

  const { registerItem, unregisterItem, isKeyboardMode } = useKeyboardNavigationContext();
  const elementRef = useRef<HTMLDivElement | null>(null);

  // Combined ref function to handle both sortable and keyboard navigation
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Set the sortable ref
      setNodeRef(node);
      // Set our internal ref
      elementRef.current = node;
    },
    [setNodeRef]
  );

  useEffect(() => {
    const id = emailItem.email; // Use email as the unique identifier

    if (id && elementRef.current) {
      registerItem('pin-header', id, elementRef.current);
    }

    return () => {
      if (id) {
        unregisterItem('pin-header', id);
      }
    };
  }, [emailItem.email, registerItem, unregisterItem]);

  // Handle keyboard activation (Enter/Space) - only trigger click, not drag
  const handleKeyboardActivation = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();

        // Create a synthetic mouse event for the onClick handler
        const syntheticEvent = {
          ...e,
          type: 'click',
          button: 0,
          buttons: 1,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey
        };

        onClick(syntheticEvent as any as React.MouseEvent);
      }
    },
    [onClick]
  );

  // Handle mouse click - check if it's a drag operation or just a click
  const handleMouseClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle click if we're not in the middle of a drag operation
      if (!isDragging) {
        onClick(e);
      }
    },
    [onClick, isDragging]
  );

  const displayName = emailItem.displayName || emailItem.email.split('@')[0];

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          ref={combinedRef}
          style={style}
          {...(!isOverlay && !isKeyboardMode && attributes)} // Don't apply drag attributes in keyboard mode
          {...(!isOverlay && !isKeyboardMode && listeners)} // Don't apply drag listeners in keyboard mode
          className={cn('group flex cursor-default flex-col items-center rounded-md p-2')}
          onClick={handleMouseClick}
          onKeyDown={handleKeyboardActivation}
          data-keyboard-item={emailItem.email}
          tabIndex={0} // Make it focusable
        >
          <div
            className={cn(
              'relative rounded-full border-2 p-0.5 transition-all duration-200',
              selected && 'border-primary/80 ring-4 ring-primary/20',
              isDragging && !isOverlay && 'scale-100',
              isOverlay && 'scale-105 shadow-xl',
              groupRingVariants,
              ringVariants
            )}
          >
            <RecipientAvatar
              className="h-10 w-10 border"
              recipient={{ email: emailItem.email, name: displayName }}
            />
          </div>
          <div className="max-w-12 overflow-hidden text-ellipsis">
            <span className="whitespace-nowrap text-xs">{displayName.split(' ')[0]}</span>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="dark">
        <ContextMenuItem onClick={() => onNewEmail(emailItem.email)}>
          <MonoIcon type={'Edit'} className="mr-2" /> {t('header.pin.new_email')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={togglePinStatus} role="menuitem" tabIndex={0}>
          <MonoIcon type={'Trash'} className="mr-2" />
          {t('header.pin.remove_from_pin')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const PinHeader: FC = () => {
  const { accounts } = useAuth();
  const { contactArray } = useContactAtom();

  // Get selected emails from query
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const { activeSpace } = useSpaceAtom();
  const { unpinEmailFromSpace, reorderPinnedEmails } = useSpacePinAtom();

  const executeCommand = useExecuteCommand();
  const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
  const [activeEmail, setActiveEmail] = useState<PinnedEmailItem | null>(null);
  const [trashable, setTrashable] = useState<boolean>(false);
  const { t } = useTranslation();

  // Create a map of emails to display names from contacts
  const emailToDisplayName = useMemo(() => {
    const map = new Map<string, string>();
    contactArray.forEach((contact) => {
      map.set(contact.emailAddress, contact.displayName);
    });
    return map;
  }, [contactArray]);

  // Get the pinned emails with display names from the active space
  const pinnedEmailItems = useMemo(() => {
    if (!activeSpace?.pinnedEmails) return [];

    return activeSpace.pinnedEmails.map((email) => ({
      email,
      displayName: emailToDisplayName.get(email) || email.split('@')[0]
    }));
  }, [activeSpace?.pinnedEmails, emailToDisplayName]);

  // Use custom tracking hook
  const { trackEvent } = useUserTrackingData();

  // Update selected emails when search query changes
  useEffect(() => {
    if (!globalSearchQuery) {
      setSelectedEmails([]);
      return;
    }

    // Extract emails from the query (e.g., from:user@example.com)
    const matches = globalSearchQuery.match(/from:([^\s]+)/g);
    if (!matches) {
      setSelectedEmails([]);
      return;
    }

    const emails = matches.map((match) => match.replace('from:', ''));
    setSelectedEmails(emails);
  }, [globalSearchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveEmail(null);
    setTrashable(false);
    if (!over) return;

    // Handle dropping to trash
    if (over.id === 'trash') {
      unpinEmailFromSpace(active.id);
      trackEvent('email_unpinned', { email: active.id });
      return;
    }

    // Skip if dropped on itself
    if (active.id === over.id) return;

    // Handle reordering
    if (activeSpace?.pinnedEmails) {
      const activeIndex = activeSpace.pinnedEmails.findIndex((email) => email === active.id);
      const overIndex = activeSpace.pinnedEmails.findIndex((email) => email === over.id);

      if (activeIndex !== -1 && overIndex !== -1) {
        // Create new order by moving the active email to the new position
        const orderedEmails = [...activeSpace.pinnedEmails];
        const [movedEmail] = orderedEmails.splice(activeIndex, 1);
        orderedEmails.splice(overIndex, 0, movedEmail);

        // Update the order in the space
        reorderPinnedEmails(orderedEmails);
        trackEvent('pinned_emails_reordered');
      }
    }
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const emailItem = pinnedEmailItems.find((item) => item.email === active.id);
    setActiveEmail(emailItem || null);
    setTrashable(true);
  };

  const { setNodeRef } = useDroppable({ id: 'pin-header' });

  const handleClickNewEmail = (email: string) => {
    if (accounts[0]) {
      executeCommand('COMPOSE_NEW_MESSAGE', {
        draft: new MonoDraft({ from: accounts[0].email, to: [email] })
      });
      trackEvent('new_email_initiated', { email });
    }
  };

  // Handle clicking on an email contact
  const handleEmailContactClick = (e: React.MouseEvent, emailItem: PinnedEmailItem) => {
    // Check if the email is already selected
    const isAlreadySelected = selectedEmails.includes(emailItem.email);

    // If shift key is pressed, toggle selection
    if (e.shiftKey) {
      const newSelectedEmails = isAlreadySelected
        ? selectedEmails.filter((email) => email !== emailItem.email)
        : [...selectedEmails, emailItem.email];

      const query = newSelectedEmails.map((email) => `from:${email}`).join(' OR ');
      searchNewQuery(query === '' ? 'category:primary' : query, undefined, false);
      trackEvent('pinned_email_selected', { email: emailItem.email, multiple: true });
    }
    // If it's already selected and not shift key, deactivate it
    else if (isAlreadySelected && selectedEmails.length === 1) {
      searchNewQuery('category:primary', undefined, false);
      trackEvent('pinned_email_deselected', { email: emailItem.email });
    }
    // Otherwise, select only this one
    else {
      searchNewQuery(`from:${emailItem.email}`, undefined, false);
      trackEvent('pinned_email_selected', { email: emailItem.email });
    }
  };

  const { registerAreaRef } = useKeyboardNavigationContext();
  const containerRef = useRef<HTMLDivElement>(null);

  // Register container ref with navigation system
  useEffect(() => {
    if (containerRef.current) {
      registerAreaRef('pin-header', containerRef.current);
    }
  });

  return (
    <div ref={setNodeRef} className="flex w-full flex-row items-center">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pinnedEmailItems.map((item) => item.email)}
          strategy={horizontalListSortingStrategy}
        >
          <ScrollArea className="flex-1">
            <div ref={containerRef} className="flex flex-1 items-center pb-1 pl-1">
              {trashable && <Trash id="trash" />}

              {pinnedEmailItems.map((emailItem) => (
                <SortableEmailContact
                  key={emailItem.email}
                  selected={selectedEmails.includes(emailItem.email)}
                  emailItem={emailItem}
                  onNewEmail={handleClickNewEmail}
                  onClick={(e) => handleEmailContactClick(e, emailItem)}
                  togglePinStatus={() => unpinEmailFromSpace(emailItem.email)}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </SortableContext>

        {createPortal(
          <DragOverlay dropAnimation={dropAnimation}>
            {activeEmail ? (
              <SortableEmailContact
                selected={false}
                emailItem={activeEmail}
                onNewEmail={() => {}}
                onClick={() => {}}
                isOverlay
                togglePinStatus={() => {}}
              />
            ) : null}
          </DragOverlay>,
          document.body
        )}
      </DndContext>
    </div>
  );
};

export default PinHeader;
