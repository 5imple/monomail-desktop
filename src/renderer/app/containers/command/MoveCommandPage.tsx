import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { generateUUID } from '@/main/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
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
  const { selectedThreads, threadsMap } = useThreadAtom();
  const { updateLabelFromThread } = useThreadLabelAtom();
  const { addUndoAction } = useUndoManager();
  const { accounts } = useAuth();

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(300);
  const [loading, setLoading] = useState(false);

  // Get selected threads data
  const selectedThreadsData = useMemo(() => {
    return selectedThreads.map((threadId) => threadsMap[threadId]).filter(Boolean);
  }, [selectedThreads, threadsMap]);

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

  // Get thread counts per account
  const accountThreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    selectedThreadsData.forEach((thread) => {
      if (thread.accountId) {
        counts[thread.accountId] = (counts[thread.accountId] || 0) + 1;
      }
    });
    return counts;
  }, [selectedThreadsData]);

  // Get move destination options (labels that can be moved to)
  const moveDestinations = useMemo(() => {
    const destinations = new Map<
      string,
      {
        label: any;
        accountIds: string[];
        accountsInfo: Array<{
          accountId: string;
          email: string;
          threadCount: number;
        }>;
      }
    >();

    // Get current labels across all selected threads to filter out destinations they're already in
    const currentLabels = new Set<string>();
    selectedThreadsData.forEach((thread) => {
      thread.labelIds.forEach((labelId) => {
        currentLabels.add(labelId);
      });
    });

    // Helper function to check if a destination should be excluded based on current labels
    const shouldExcludeDestination = (destinationId: string, destinationName: string) => {
      // For system labels, check direct label ID match
      if (
        destinationId === 'INBOX' ||
        destinationId === 'STARRED' ||
        destinationId === 'TRASH' ||
        destinationId === 'SPAM'
      ) {
        return currentLabels.has(destinationId);
      }

      // For "Done", check if threads are already done (don't have INBOX label)
      if (destinationName === 'Done') {
        // If any thread has INBOX, then moving to Done makes sense
        // If no threads have INBOX, they're already done
        return !currentLabels.has('INBOX');
      }

      // For custom labels, check if the label ID is already present
      if (destinationId.startsWith('Label_')) {
        return currentLabels.has(destinationId);
      }

      return false;
    };

    // System labels that can be moved to (excluding Sent and Draft)
    const systemLabels = [
      { name: 'Inbox', id: 'INBOX', color: { backgroundColor: '#1976D250', textColor: '#FFFFFF' } },
      { name: 'Done', id: 'DONE', color: { backgroundColor: '#388E3C50', textColor: '#FFFFFF' } },
      {
        name: 'Starred',
        id: 'STARRED',
        color: { backgroundColor: '#F57C0050', textColor: '#FFFFFF' }
      },
      { name: 'Trash', id: 'TRASH', color: { backgroundColor: '#D32F2F50', textColor: '#FFFFFF' } },
      { name: 'Spam', id: 'SPAM', color: { backgroundColor: '#E64A1950', textColor: '#FFFFFF' } }
    ];

    // Add system labels (available for all accounts) - but only if not already there
    systemLabels.forEach((label) => {
      if (!shouldExcludeDestination(label.id, label.name)) {
        destinations.set(label.name, {
          label,
          accountIds: selectedAccountIds,
          accountsInfo: selectedAccountIds.map((accountId) => ({
            accountId,
            email: accountEmailMap[accountId],
            threadCount: accountThreadCounts[accountId] || 0
          }))
        });
      }
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
      const accountsInfoWithLabel: Array<{
        accountId: string;
        email: string;
        threadCount: number;
      }> = [];

      selectedAccountIds.forEach((accountId) => {
        const accountLabels = labelsMapByAccount[accountId] || {};
        const hasLabel = Object.values(accountLabels).some(
          (label) => label.name === labelName && label.id.startsWith('Label_')
        );

        if (hasLabel) {
          accountsWithLabel.push(accountId);
          accountsInfoWithLabel.push({
            accountId,
            email: accountEmailMap[accountId],
            threadCount: accountThreadCounts[accountId] || 0
          });
        }
      });

      if (accountsWithLabel.length > 0) {
        const label = Object.values(labelsMapByAccount[accountsWithLabel[0]] || {}).find(
          (l) => l.name === labelName
        );

        if (label && !shouldExcludeDestination(label.id, label.name)) {
          destinations.set(labelName, {
            label,
            accountIds: accountsWithLabel,
            accountsInfo: accountsInfoWithLabel
          });
        }
      }
    });

    return Array.from(destinations.values());
  }, [
    labelsMapByAccount,
    selectedAccountIds,
    accountEmailMap,
    accountThreadCounts,
    selectedThreadsData
  ]);

  // Handle moving conversations to a destination
  const handleMoveToDestination = useCallback(
    async (
      destinationLabel: any,
      accountsInfo: Array<{ accountId: string; threadCount: number }>
    ) => {
      bounce();

      const totalThreads = accountsInfo.reduce((sum, info) => sum + info.threadCount, 0);
      if (totalThreads === 0) return;

      let undoFunction: (() => Promise<void>) | undefined;

      // Define the promise that will handle the move operation
      const movePromise = async () => {
        // Store original thread states for undo
        const originalThreadStates: Array<{
          accountId: string;
          threadIds: string[];
          originalLabels: string[];
          labelsToAdd: string[];
          labelsToRemove: string[];
        }> = [];

        // Process each account
        for (const { accountId, threadCount } of accountsInfo) {
          if (threadCount === 0) continue;

          // Get threads for this account
          const accountThreads = selectedThreadsData
            .filter((thread) => thread.accountId === accountId)
            .map((thread) => thread.id);

          if (accountThreads.length === 0) continue;

          // Get current labels to remove (we'll remove INBOX, DONE, etc. but keep STARRED, UNREAD, etc.)
          const labelsToRemove: string[] = [];
          const currentThread = selectedThreadsData.find(
            (thread) => thread.accountId === accountId
          );

          if (currentThread) {
            // Store original labels for undo
            const originalLabels = [...currentThread.labelIds];

            // Remove organizational labels but keep status labels
            const organizationalLabels = ['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM'];
            organizationalLabels.forEach((label) => {
              if (currentThread.labelIds.includes(label)) {
                labelsToRemove.push(label);
              }
            });

            // Remove custom labels (Label_*)
            currentThread.labelIds.forEach((labelId) => {
              if (labelId.startsWith('Label_')) {
                labelsToRemove.push(labelId);
              }
            });

            // Special handling for system labels
            let labelToAdd = destinationLabel.id;
            if (destinationLabel.name === 'Done') {
              // For "Done", we remove INBOX instead of adding DONE
              labelToAdd = '';
              if (!labelsToRemove.includes('INBOX')) {
                labelsToRemove.push('INBOX');
              }
            }

            // Store state for undo
            originalThreadStates.push({
              accountId,
              threadIds: accountThreads,
              originalLabels,
              labelsToAdd: labelToAdd ? [labelToAdd] : [],
              labelsToRemove
            });

            // Perform the move
            await updateLabelFromThread(
              accountId,
              accountThreads,
              labelToAdd ? [labelToAdd] : [],
              labelsToRemove,
              true,
              true, // shouldRemoveThread - remove from current view
              false, // shouldRestoreThread
              undefined // afterStateUpdate - don't close yet, wait for promise to resolve
            );
          }
        }

        // Define undo function
        undoFunction = async () => {
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

        return { count: totalThreads, destinationName: destinationLabel.name };
      };

      const uuid = generateUUID();

      // Use toast.promise to show loading/success/error states
      toast.promise(movePromise, {
        id: uuid,
        loading:
          totalThreads === 1
            ? t('toast.thread.moving_to', { destination: destinationLabel.name })
            : t('toast.thread.moving_to_multiple', {
                count: totalThreads,
                destination: destinationLabel.name
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
              Undo <ShortcutKeyboard variant="text" className="gap-0" shortcut={'MOD+Z'} />
            </span>
          ),
          onClick: () => undoFunction && undoFunction()
        },
        error: t('toast.thread.move_error', { destination: destinationLabel.name })
      });

      // Close the command panel after successful move
      onClose();
      onOpenChange(false);
    },
    [selectedThreadsData, updateLabelFromThread, bounce, onClose, addUndoAction, t]
  );

  useLayoutEffect(() => {
    if (!loading) {
      setTimeout(() => {
        if (commandListRef.current) {
          const computedHeight = commandListRef.current.scrollHeight;
          setListHeight(computedHeight < 300 ? computedHeight : 300);
        }
      }, 0);
    }
  }, [moveValue, loading]);

  // Filter destinations based on search input
  const filteredDestinations =
    moveValue.trim() === ''
      ? moveDestinations
      : moveDestinations.filter(({ label }) =>
          label.name.toLowerCase().includes(moveValue.toLowerCase())
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
        className={cn(
          'h-[0px] origin-top transition-all duration-200 ease-bouncy-in-out',
          loading ? '' : `h-[${listHeight}px]`
        )}
        style={{ transition: 'height 300ms', height: `${listHeight}px` }}
      >
        <div ref={commandListRef}>
          <CommandEmpty>{t('command_palette.move.no_destinations_found')}</CommandEmpty>

          {selectedThreadsData.length > 0 && filteredDestinations.length > 0 && (
            <CommandGroup className="p-2">
              {filteredDestinations.map(({ label, accountIds, accountsInfo }) => {
                const totalThreads = accountsInfo.reduce((sum, info) => sum + info.threadCount, 0);

                return (
                  <CommandItem
                    key={`${label.name}-${accountIds.join('-')}`}
                    variant={'raycast'}
                    value={label.name}
                    onSelect={() => handleMoveToDestination(label, accountsInfo)}
                  >
                    <div className="flex w-full items-center">
                      <div
                        className="ml-2 mr-4 flex h-[20px] w-[5.5px] items-center justify-center rounded-sm"
                        style={{ backgroundColor: label.color.backgroundColor }}
                      ></div>
                      <div className="flex w-full flex-col">
                        <span>
                          {t('command_palette.header.move_to')} {label.name.replace('Mono/', '')}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </div>
      </CommandList>
    </div>
  );
};

export default MoveCommandPage;
