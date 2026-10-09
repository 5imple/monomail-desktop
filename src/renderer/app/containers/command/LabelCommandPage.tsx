import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import React, { useCallback, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface LabelCommandPageProps {
  labelValue: string;
  setLabelValue: (name: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Replace this page with Move (labels aren't available for Microsoft 365). */
  onSwitchToMove?: () => void;
}

const displayName = (name: string) => name.replace('Mono/', '');

// A label's colour as a centred dot in the 32px leading slot every palette row
// uses; uncoloured labels (Gmail sends `color: {}`) get a muted dot.
const LabelDot = ({ color }: { color?: string }) => (
  <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
    <span
      className={cn('h-2.5 w-2.5 rounded-full', !color && 'bg-muted-foreground/40')}
      style={color ? { backgroundColor: color } : undefined}
    />
  </div>
);

// One fixed 16px slot, so the text doesn't shift as a row toggles: an empty
// ring, or the inbox's blue selection circle with a check (all) or a dash
// (some of the conversations).
const CheckIndicator = ({ state }: { state: 'checked' | 'partial' | 'unchecked' }) =>
  state === 'unchecked' ? (
    <span aria-hidden className="ml-2 h-4 w-4 shrink-0 rounded-full border border-border" />
  ) : (
    <span
      aria-hidden
      className="ml-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-selection text-selection-foreground"
    >
      <MonoIcon type={state === 'checked' ? 'Check' : 'Minus'} className="h-3 w-3" />
    </span>
  );

const LabelCommandPage: React.FC<LabelCommandPageProps> = ({
  labelValue,
  setLabelValue,
  onClose,
  bounce,
  onKeydown,
  onSwitchToMove
}) => {
  const { t } = useTranslation();
  const { labelsMapByAccount, createLabel } = useLabelAtom();
  const { activeThreadId, selectedThreads, threadsMap } = useThreadAtom();
  const { addLabelToThread, removeLabelFromThread } = useThreadLabelAtom();
  const { accounts } = useAuth();

  const commandListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

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

  // Labels exist only for Gmail accounts so far (Microsoft 365 has no label
  // API wired up), which used to leave Microsoft users on "No labels found."
  const isMicrosoftAccount = useCallback(
    (accountId: string) => accounts.find((acc) => acc.uid === accountId)?.provider === 'microsoft',
    [accounts]
  );
  const labelAccountIds = useMemo(
    () => selectedAccountIds.filter((accountId) => !isMicrosoftAccount(accountId)),
    [selectedAccountIds, isMicrosoftAccount]
  );
  const microsoftOnly = selectedAccountIds.length > 0 && labelAccountIds.length === 0;
  const someMicrosoft = !microsoftOnly && labelAccountIds.length < selectedAccountIds.length;

  // Get email addresses for each account ID
  const accountEmailMap = useMemo(() => {
    const emailMap: Record<string, string> = {};

    // Get emails from the accounts data
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

  // Combine all labels from selected accounts and identify missing labels per account
  const allAccountLabels = useMemo(() => {
    const allLabelsMap = new Map<
      string,
      {
        label: any;
        accountIds: string[];
        accountsInfo: Array<{
          accountId: string;
          email: string;
          threadCount: number;
        }>;
        missingInAccounts: Array<{
          accountId: string;
          email: string;
          threadCount: number;
        }>;
      }
    >();

    // First collect all unique label names across all accounts
    const allLabelNames = new Set<string>();
    labelAccountIds.forEach((accountId) => {
      const accountLabels = labelsMapByAccount[accountId] || {};
      Object.values(accountLabels)
        .filter((label) => label.id.startsWith('Label_'))
        .forEach((label) => {
          allLabelNames.add(label.name);
        });
    });

    // Then create the full mapping with present and missing accounts info
    allLabelNames.forEach((labelName) => {
      const accountsWithLabel: string[] = [];
      const accountsInfoWithLabel: Array<{
        accountId: string;
        email: string;
        threadCount: number;
      }> = [];
      const accountsInfoWithoutLabel: Array<{
        accountId: string;
        email: string;
        threadCount: number;
      }> = [];

      // Only label-capable accounts can be offered "create it here too".
      labelAccountIds.forEach((accountId) => {
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
        } else {
          accountsInfoWithoutLabel.push({
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

        if (label) {
          allLabelsMap.set(labelName, {
            label,
            accountIds: accountsWithLabel,
            accountsInfo: accountsInfoWithLabel,
            missingInAccounts: accountsInfoWithoutLabel
          });
        }
      }
    });

    // Alphabetical, as people scan for a name (it was API order).
    return Array.from(allLabelsMap.values()).sort((a, b) =>
      displayName(a.label.name).localeCompare(displayName(b.label.name), undefined, {
        sensitivity: 'base'
      })
    );
  }, [labelsMapByAccount, labelAccountIds, accountEmailMap, accountThreadCounts]);

  // Determine the overall check state for a label across all selected threads and accounts
  const getLabelCheckState = useCallback(
    (labelName: string, accountsWithLabel: string[]) => {
      const accountsWithLabelSet = new Set(accountsWithLabel);
      let checkedCount = 0;
      let totalThreadsCount = 0;

      selectedAccountIds.forEach((accountId) => {
        if (!accountsWithLabelSet.has(accountId)) return;

        const accountLabels = labelsMapByAccount[accountId] || {};
        const labelId = Object.values(accountLabels).find((label) => label.name === labelName)?.id;

        if (!labelId) return;

        const accountThreads = selectedThreadsData.filter(
          (thread) => thread.accountId === accountId
        );
        totalThreadsCount += accountThreads.length;

        accountThreads.forEach((thread) => {
          if (thread.labelIds.includes(labelId)) {
            checkedCount++;
          }
        });
      });

      if (checkedCount === 0) return 'unchecked';
      if (checkedCount === totalThreadsCount) return 'checked';
      return 'partial';
    },
    [labelsMapByAccount, selectedAccountIds, selectedThreadsData]
  );

  // Add handler for creating label in other accounts
  const handleCreateLabelInOtherAccounts = useCallback(
    async (
      labelName: string,
      missingAccounts: Array<{ accountId: string; threadCount: number }>
    ) => {
      bounce();

      try {
        // Create the label in each account where it's missing and apply it to threads
        for (const { accountId, threadCount } of missingAccounts) {
          if (threadCount === 0) continue; // Skip if no threads in this account

          // Create the label
          const newLabel = await createLabel(labelName, accountId);

          if (newLabel) {
            // Get threads for this account
            const accountThreads = selectedThreadsData
              .filter((thread) => thread.accountId === accountId)
              .map((thread) => thread.id);
            // Apply the label to those threads
            await addLabelToThread(accountId, accountThreads, newLabel.id);
          } else {
            throw new Error(`Failed to create label "${labelName}" for account ${accountId}`);
          }
        }
      } catch (error) {
        console.error(`Failed to create label ${labelName} in other accounts`, error);
        toast.error(t('toast.label.create_error', { name: displayName(labelName) }));
      }
    },
    [selectedThreadsData, createLabel, addLabelToThread, bounce, t]
  );

  // "Create label “X”" from the typed text: one label per Gmail account that
  // has conversations here, applied to them right away.
  const handleCreateLabelFromInput = useCallback(async () => {
    const name = labelValue.trim();
    if (!name) return;
    bounce();
    try {
      for (const accountId of labelAccountIds) {
        const accountThreads = selectedThreadsData
          .filter((thread) => thread.accountId === accountId)
          .map((thread) => thread.id);
        if (accountThreads.length === 0) continue;
        const newLabel = await createLabel(name, accountId);
        if (!newLabel) throw new Error(`Failed to create label "${name}" for ${accountId}`);
        await addLabelToThread(accountId, accountThreads, newLabel.id);
      }
      setLabelValue('');
    } catch (error) {
      console.error(`Failed to create label ${name}`, error);
      toast.error(t('toast.label.create_error', { name }));
    }
  }, [
    labelValue,
    labelAccountIds,
    selectedThreadsData,
    createLabel,
    addLabelToThread,
    setLabelValue,
    bounce,
    t
  ]);

  const handleLabelToggle = useCallback(
    async (
      labelName: string,
      checkState: string,
      accountsInfo: Array<{ accountId: string; threadCount: number }>
    ) => {
      bounce();

      try {
        const isAdding = checkState !== 'checked';

        // Only process accounts that already have the label (no auto-creation for other accounts)
        const accountsToProcess = accountsInfo.map((info) => info.accountId);

        // Process each account. Awaited: a failure was an unhandled rejection
        // — the check flipped back with no message.
        for (const accountId of accountsToProcess) {
          // Get threads for this account
          const accountThreads = selectedThreadsData
            .filter((thread) => thread.accountId === accountId)
            .map((thread) => thread.id);

          if (accountThreads.length === 0) continue;

          const accountLabels = labelsMapByAccount[accountId] || {};
          const labelId = Object.values(accountLabels).find(
            (label) => label.name === labelName
          )?.id;

          // If we have a label ID, apply or remove it
          if (labelId) {
            if (isAdding) {
              await addLabelToThread(accountId, accountThreads, labelId);
            } else {
              await removeLabelFromThread(accountId, accountThreads, labelId);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to toggle label ${labelName}`, error);
        toast.error(t('toast.label.apply_error', { name: displayName(labelName) }));
      }
    },
    [selectedThreadsData, labelsMapByAccount, addLabelToThread, removeLabelFromThread, bounce, t]
  );

  useLayoutEffect(() => {
    if (!loading) {
      setTimeout(() => {
        if (commandListRef.current) {
          const computedHeight = commandListRef.current.scrollHeight;
          setListHeight(computedHeight < 300 ? computedHeight : 300); // Limit to max height
        }
      }, 0);
    }
  }, [labelValue, loading]);

  // Filter labels based on search input
  const filteredLabels =
    labelValue.trim() === ''
      ? allAccountLabels
      : allAccountLabels.filter(({ label }) =>
          label.name.toLowerCase().includes(labelValue.toLowerCase())
        );

  // Offer to create the typed name unless a label already has it (any case).
  const typedName = labelValue.trim();
  const canCreateTyped =
    typedName.length > 0 &&
    labelAccountIds.some((accountId) => (accountThreadCounts[accountId] || 0) > 0) &&
    !allAccountLabels.some(
      ({ label }) => displayName(label.name).toLowerCase() === typedName.toLowerCase()
    );

  // Group labels with missing accounts for better UX
  const labelGroups = useMemo(() => {
    const incompleteLabels = filteredLabels.filter(({ missingInAccounts }) =>
      missingInAccounts.some((account) => account.threadCount > 0)
    );

    const completeLabels = filteredLabels.filter(
      ({ missingInAccounts }) => !missingInAccounts.some((account) => account.threadCount > 0)
    );

    return {
      incompleteLabels,
      completeLabels
    };
  }, [filteredLabels]);

  return (
    <div className="flex flex-col">
      <EnhancedCommandInput
        autoFocus
        placeholder={t('command_palette.label.placeholder')}
        value={labelValue}
        onValueChange={setLabelValue}
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
          {microsoftOnly ? (
            // Say why, and offer what does work, instead of a dead end
            // (forceMount: typed text must not filter the explanation away).
            <CommandGroup forceMount className="p-2">
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {t('command_palette.label.unsupported_provider')}
              </div>
              {onSwitchToMove && (
                <CommandItem forceMount variant={'raycast'} value="move" onSelect={onSwitchToMove}>
                  <CommandIcon type="ArrowRight" />
                  <span>{t('command_palette.label.go_to_move')}</span>
                </CommandItem>
              )}
            </CommandGroup>
          ) : (
            <CommandEmpty>{t('command_palette.label.no_labels_found')}</CommandEmpty>
          )}

          {!microsoftOnly && selectedThreadsData.length > 0 && canCreateTyped && (
            <CommandGroup className="p-2">
              <CommandItem
                variant={'raycast'}
                // Always contains the query, so it never filters itself out.
                value={`${typedName} create-label`}
                onSelect={handleCreateLabelFromInput}
              >
                <CommandIcon type="Plus" />
                <span className="truncate">
                  {t('command_palette.label.create_label', { name: typedName })}
                </span>
              </CommandItem>
            </CommandGroup>
          )}

          {!microsoftOnly && selectedThreadsData.length > 0 && filteredLabels.length > 0 && (
            <>
              {/* Labels that need creation in other accounts */}
              {labelGroups.incompleteLabels.length > 0 && (
                <CommandGroup heading={t('command_palette.header.create_labels')} className="p-2">
                  {labelGroups.incompleteLabels.map(
                    ({ label, accountIds, accountsInfo, missingInAccounts }) => {
                      const missingAccountsWithThreads = missingInAccounts.filter(
                        (a) => a.threadCount > 0
                      );
                      const totalMissingThreads = missingAccountsWithThreads.reduce(
                        (sum, info) => sum + info.threadCount,
                        0
                      );

                      // Only show if there are threads that would be affected
                      if (missingAccountsWithThreads.length === 0) return null;

                      return (
                        <CommandItem
                          key={`create-${label.name}`}
                          variant={'raycast'}
                          value={`create-${label.name}`}
                          onSelect={() =>
                            handleCreateLabelInOtherAccounts(label.name, missingAccountsWithThreads)
                          }
                          className=""
                        >
                          <div className="flex w-full items-center">
                            <CommandIcon type="Plus" />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate">
                                {displayName(label.name)} -{' '}
                                {t('command_palette.label.create_in_accounts', {
                                  count: missingAccountsWithThreads.length
                                })}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {missingAccountsWithThreads
                                  .map((info) => `${info.email}`)
                                  .join(', ')}
                              </span>
                            </div>
                          </div>
                        </CommandItem>
                      );
                    }
                  )}
                </CommandGroup>
              )}

              {/* All labels (regular toggle functionality) */}
              <CommandGroup heading={t('command_palette.header.labels')} className="p-2">
                {filteredLabels.map(({ label, accountIds, accountsInfo }, index) => {
                  const checkState = getLabelCheckState(label.name, accountIds);

                  return (
                    <CommandItem
                      key={`${label.name}-${accountIds.join('-')}`}
                      variant={'raycast'}
                      value={label.name}
                      aria-checked={
                        checkState === 'checked' ? true : checkState === 'partial' ? 'mixed' : false
                      }
                      onSelect={() => handleLabelToggle(label.name, checkState, accountsInfo)}
                    >
                      <div className="flex w-full items-center">
                        <LabelDot color={label.color?.backgroundColor} />
                        <span className="min-w-0 flex-1 truncate">{displayName(label.name)}</span>
                        <CheckIndicator state={checkState} />
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          {someMicrosoft && (
            <div className="px-5 pb-3 text-xs text-muted-foreground">
              {t('command_palette.label.some_unsupported')}
            </div>
          )}
        </div>
      </CommandList>
    </div>
  );
};

export default LabelCommandPage;
