import { MonoIconType } from '@/renderer/app/components/icons/icons';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { generateUUID } from '@/main/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { threadExitIntentAtom, ThreadExitIntent } from '@/renderer/app/store/thread/exitIntentAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { useSetAtom } from 'jotai';
import React, { useCallback, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';

interface MoveCommandPageProps {
  moveValue: string;
  setMoveValue: (name: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenChange: (isOpen: boolean) => void;
}

// System destinations, with the same icons as the root "Go to …" commands.
// Starred isn't one: starring is S, and "Move to Starred" actually archived.
const SYSTEM_DESTINATIONS: Array<{ id: string; nameKey: string; icon: MonoIconType }> = [
  { id: 'INBOX', nameKey: 'command_palette.move.destination.inbox', icon: 'Inbox' },
  { id: 'DONE', nameKey: 'command_palette.move.destination.done', icon: 'CheckCircle' },
  { id: 'TRASH', nameKey: 'command_palette.move.destination.trash', icon: 'Trash' },
  { id: 'SPAM', nameKey: 'command_palette.move.destination.spam', icon: 'AlertCircle' }
];

// Is the thread already where this destination would put it?
const isAtDestination = (labelIds: string[], destinationId: string) =>
  destinationId === 'DONE'
    ? // Done = out of the Inbox (and not in Trash/Spam)
      !labelIds.includes('INBOX') && !labelIds.includes('TRASH') && !labelIds.includes('SPAM')
    : labelIds.includes(destinationId);

const MoveCommandPage: React.FC<MoveCommandPageProps> = ({
  moveValue,
  setMoveValue,
  onClose,
  bounce,
  onKeydown,
  onOpenChange
}) => {
  const { t } = useTranslation();
  const { labelsMapByAccount } = useLabelAtom();
  const { activeThreadId, selectedThreads, threadsMap } = useThreadAtom();
  const { updateLabelFromThread } = useThreadLabelAtom();
  const { addUndoAction } = useUndoManager();
  const { accounts } = useAuth();
  const setExitIntents = useSetAtom(threadExitIntentAtom);

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);

  // Get selected threads data
  // Same target as the thread commands: the open thread, else the selection.
  // Reading only the selection left this page empty ("No labels found") when
  // opened from the reader, since opening a thread doesn't select it.
  const selectedThreadsData = useMemo(() => {
    const targetIds = activeThreadId ? [activeThreadId] : selectedThreads;
    return targetIds.map((threadId) => threadsMap[threadId]).filter(Boolean);
  }, [activeThreadId, selectedThreads, threadsMap]);

  // Get unique account IDs from selected threads
  const selectedAccountIds = useMemo(() => {
    const accountIds = new Set<string>();
    selectedThreadsData.forEach((thread) => {
      if (thread.accountId) {
        accountIds.add(thread.accountId);
      }
    });
    return Array.from(accountIds);
  }, [selectedThreadsData]);

  // Get email addresses for each account ID
  const accountEmailMap = useMemo(() => {
    const emailMap: Record<string, string> = {};
    selectedAccountIds.forEach((accountId) => {
      const account = accounts.find((acc) => acc.uid === accountId);
      emailMap[accountId] = account?.email || accountId;
    });
    return emailMap;
  }, [selectedAccountIds, accounts]);

  // Get move destination options (labels that can be moved to)
  const moveDestinations = useMemo(() => {
    const destinations = new Map<
      string,
      {
        label: any;
        displayName: string;
        icon?: MonoIconType;
        accountIds: string[];
        accountsInfo: Array<{
          accountId: string;
          email: string;
          threadCount: number;
        }>;
      }
    >();

    // Only hide a destination when every target is already there: with the
    // union, one Inbox thread hid "Move to Inbox" for all the others too.
    const everyThreadAt = (destinationId: string) =>
      selectedThreadsData.length > 0 &&
      selectedThreadsData.every((thread) => isAtDestination(thread.labelIds, destinationId));

    // Threads that would actually move, counted per account.
    const accountsInfoFor = (destinationId: string, accountIds: string[]) =>
      accountIds.map((accountId) => ({
        accountId,
        email: accountEmailMap[accountId],
        threadCount: selectedThreadsData.filter(
          (thread) =>
            thread.accountId === accountId && !isAtDestination(thread.labelIds, destinationId)
        ).length
      }));

    // Add system labels (available for all accounts) - but only if not already there
    SYSTEM_DESTINATIONS.forEach((destination) => {
      if (everyThreadAt(destination.id)) return;
      const name = t(destination.nameKey);
      destinations.set(destination.id, {
        label: { id: destination.id, name },
        displayName: name,
        icon: destination.icon,
        accountIds: selectedAccountIds,
        accountsInfo: accountsInfoFor(destination.id, selectedAccountIds)
      });
    });

    // Add custom labels
    const allLabelNames = new Set<string>();
    selectedAccountIds.forEach((accountId) => {
      const accountLabels = labelsMapByAccount[accountId] || {};
      Object.values(accountLabels)
        .filter((label) => label.id.startsWith('Label_'))
        .forEach((label) => {
          allLabelNames.add(label.name);
        });
    });

    allLabelNames.forEach((labelName) => {
      const accountsWithLabel: string[] = [];

      selectedAccountIds.forEach((accountId) => {
        const accountLabels = labelsMapByAccount[accountId] || {};
        const hasLabel = Object.values(accountLabels).some(
          (label) => label.name === labelName && label.id.startsWith('Label_')
        );

        if (hasLabel) {
          accountsWithLabel.push(accountId);
        }
      });

      if (accountsWithLabel.length > 0) {
        const label = Object.values(labelsMapByAccount[accountsWithLabel[0]] || {}).find(
          (l) => l.name === labelName
        );

        if (label && !everyThreadAt(label.id)) {
          destinations.set(`label:${labelName}`, {
            label,
            displayName: labelName.replace('Mono/', ''),
            accountIds: accountsWithLabel,
            accountsInfo: accountsInfoFor(label.id, accountsWithLabel)
          });
        }
      }
    });

    return Array.from(destinations.values());
  }, [labelsMapByAccount, selectedAccountIds, accountEmailMap, selectedThreadsData, t]);

  const markExit = useCallback(
    (threadIds: string[], intent: ThreadExitIntent | null) =>
      setExitIntents((prev) => {
        const next = { ...prev };
        threadIds.forEach((id) => {
          if (intent) next[id] = intent;
          else delete next[id];
        });
        return next;
      }),
    [setExitIntents]
  );

  // Handle moving conversations to a destination
  const handleMoveToDestination = useCallback(
    async (
      destinationLabel: { id: string; name: string },
      destinationName: string,
      accountsInfo: Array<{ accountId: string; threadCount: number }>
    ) => {
      bounce();

      const isDone = destinationLabel.id === 'DONE';
      // Only threads not already there move (and are counted, and undone).
      const movingThreads = selectedThreadsData.filter(
        (thread) =>
          accountsInfo.some((info) => info.accountId === thread.accountId) &&
          !isAtDestination(thread.labelIds, destinationLabel.id)
      );
      const totalThreads = movingThreads.length;
      if (totalThreads === 0) return;

      // Store original thread states for undo — per thread: using the first
      // thread's labels for a whole account left other threads' labels in
      // place on move and re-added labels they never had on undo.
      const originalThreadStates = movingThreads.map((currentThread) => {
        const originalLabels = [...currentThread.labelIds];
        const labelToAdd = isDone ? '' : destinationLabel.id;

        // Remove organizational labels but keep status labels (STARRED, UNREAD, …)
        const labelsToRemove: string[] = [];
        const organizationalLabels = ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM'];
        organizationalLabels.forEach((label) => {
          if (currentThread.labelIds.includes(label) && label !== labelToAdd) {
            labelsToRemove.push(label);
          }
        });

        // Remove custom labels (Label_*), never the one being added
        currentThread.labelIds.forEach((labelId) => {
          if (labelId.startsWith('Label_') && labelId !== labelToAdd) {
            labelsToRemove.push(labelId);
          }
        });

        // For "Done", we remove INBOX instead of adding DONE
        if (isDone && !labelsToRemove.includes('INBOX')) {
          labelsToRemove.push('INBOX');
        }

        return {
          accountId: currentThread.accountId as string,
          threadIds: [currentThread.id],
          originalLabels,
          labelsToAdd: labelToAdd ? [labelToAdd] : [],
          labelsToRemove
        };
      });

      // The same swipe as the Done / Trash buttons: trash and spam leave
      // left, everything else (archive, labels) right; back to Inbox fades.
      const exitIntent: ThreadExitIntent | null =
        destinationLabel.id === 'TRASH' || destinationLabel.id === 'SPAM'
          ? 'trash'
          : destinationLabel.id === 'INBOX'
            ? null
            : 'archive';
      const movingIds = movingThreads.map((thread) => thread.id);

      let undoFunction: (() => Promise<void>) | undefined;

      // Define the promise that will handle the move operation
      const movePromise = async () => {
        if (exitIntent) markExit(movingIds, exitIntent);
        try {
          // All at once, so the rows leave together (one after another, each
          // waited for its own server round trip).
          await Promise.all(
            originalThreadStates.map((state) =>
              updateLabelFromThread(
                state.accountId,
                state.threadIds,
                state.labelsToAdd,
                state.labelsToRemove,
                true,
                true, // shouldRemoveThread - remove from current view
                false, // shouldRestoreThread
                undefined // afterStateUpdate - don't close yet, wait for promise to resolve
              )
            )
          );
        } catch (error) {
          markExit(movingIds, null);
          throw error;
        }

        // Define undo function
        undoFunction = async () => {
          markExit(movingIds, null);
          for (const state of originalThreadStates) {
            // Calculate what labels to add back and remove to restore original state
            const currentLabels = state.originalLabels.filter(
              (label) => !state.labelsToRemove.includes(label)
            );
            const labelsAfterMove = [...currentLabels, ...state.labelsToAdd];

            const labelsToAddForUndo = state.originalLabels.filter(
              (label) => !labelsAfterMove.includes(label)
            );
            const labelsToRemoveForUndo = labelsAfterMove.filter(
              (label) => !state.originalLabels.includes(label)
            );

            await updateLabelFromThread(
              state.accountId,
              state.threadIds,
              labelsToAddForUndo,
              labelsToRemoveForUndo,
              true,
              false, // shouldRemoveThread
              true, // shouldRestoreThread
              undefined // afterStateUpdate
            );
          }
        };

        return { count: totalThreads, destinationName };
      };

      const uuid = generateUUID();

      // Use toast.promise to show loading/success/error states
      toast.promise(movePromise, {
        id: uuid,
        loading:
          totalThreads === 1
            ? t('toast.thread.moving_to', { destination: destinationName })
            : t('toast.thread.moving_to_multiple', {
                count: totalThreads,
                destination: destinationName
              }),
        success: (data) => {
          if (undoFunction) {
            addUndoAction({
              execute: undoFunction,
              timestamp: Date.now(),
              toastId: uuid
            });
          }

          return data.count === 1
            ? t('toast.thread.moved_to', { destination: data.destinationName })
            : t('toast.thread.moved_to_multiple', {
                count: data.count,
                destination: data.destinationName
              });
        },
        action: {
          label: (
            <span className="inline-flex items-end gap-1">
              {t('toast.undo')} <ShortcutKeyboard variant="text" className="gap-0" shortcut={'Z'} />
            </span>
          ),
          onClick: () => undoFunction && undoFunction()
        },
        error: t('toast.thread.move_error', { destination: destinationName })
      });

      // Close the command panel after successful move
      onClose();
      onOpenChange(false);
    },
    [
      selectedThreadsData,
      updateLabelFromThread,
      bounce,
      onClose,
      onOpenChange,
      addUndoAction,
      markExit,
      t
    ]
  );

  useLayoutEffect(() => {
    setTimeout(() => {
      if (commandListRef.current) {
        const computedHeight = commandListRef.current.scrollHeight;
        setListHeight(computedHeight < 300 ? computedHeight : 300);
      }
    }, 0);
  }, [moveValue]);

  // Filter destinations based on search input
  const filteredDestinations =
    moveValue.trim() === ''
      ? moveDestinations
      : moveDestinations.filter(({ displayName }) =>
          displayName.toLowerCase().includes(moveValue.toLowerCase())
        );

  return (
    <div className="flex flex-col">
      <EnhancedCommandInput
        autoFocus
        placeholder={t('command_palette.move.placeholder')}
        value={moveValue}
        onValueChange={setMoveValue}
        onKeyDown={onKeydown}
      />

      <CommandList
        className="origin-top transition-all duration-200 ease-bouncy-in-out"
        style={
          listHeight === undefined
            ? { transition: 'height 300ms' }
            : { transition: 'height 300ms', height: `${listHeight}px` }
        }
      >
        <div ref={commandListRef}>
          <CommandEmpty>{t('command_palette.move.no_destinations_found')}</CommandEmpty>

          {selectedThreadsData.length > 0 && filteredDestinations.length > 0 && (
            <CommandGroup heading={t('command_palette.header.move_to')} className="p-2">
              {filteredDestinations.map(
                ({ label, displayName, icon, accountIds, accountsInfo }) => (
                  <CommandItem
                    key={`${label.name}-${accountIds.join('-')}`}
                    variant={'raycast'}
                    value={label.name}
                    onSelect={() => handleMoveToDestination(label, displayName, accountsInfo)}
                  >
                    <div className="flex w-full items-center">
                      {icon ? (
                        <CommandIcon type={icon} />
                      ) : (
                        // Custom label: its colour as a dot (muted when it has none).
                        <div
                          aria-hidden
                          className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center"
                        >
                          <span
                            className={cn(
                              'h-2.5 w-2.5 rounded-full',
                              !label.color?.backgroundColor && 'bg-muted-foreground/40'
                            )}
                            style={
                              label.color?.backgroundColor
                                ? { backgroundColor: label.color.backgroundColor }
                                : undefined
                            }
                          />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate">{displayName}</span>
                    </div>
                  </CommandItem>
                )
              )}
            </CommandGroup>
          )}
        </div>
      </CommandList>
    </div>
  );
};

export default MoveCommandPage;
