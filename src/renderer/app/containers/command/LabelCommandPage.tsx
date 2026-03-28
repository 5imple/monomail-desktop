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
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import React, { useCallback, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface LabelCommandPageProps {
  labelValue: string;
  setLabelValue: (name: string) => void;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const LabelCommandPage: React.FC<LabelCommandPageProps> = ({
  labelValue,
  setLabelValue,
  onClose,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const { labelsMapByAccount, createLabel } = useLabelAtom();
  const { selectedThreads, threadsMap } = useThreadAtom();
  const { addLabelToThread, removeLabelFromThread } = useThreadLabelAtom();
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
    selectedAccountIds.forEach((accountId) => {
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

    return Array.from(allLabelsMap.values());
  }, [labelsMapByAccount, selectedAccountIds, accountEmailMap, accountThreadCounts]);

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
            // const accountThreads = selectedThreadsData
            //   .filter((thread) => thread.accountId === accountId)
            //   .map((thread) => thread.id);
            // Apply the label to those threads
            // await addLabelToThread(accountId, accountThreads, newLabel.id);
          } else {
            console.error(`Failed to create label "${labelName}" for account ${accountId}`);
          }
        }
      } catch (error) {
        console.error(`Failed to create label ${labelName} in other accounts`, error);
      }
    },
    [selectedThreadsData, createLabel, addLabelToThread, bounce]
  );

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

        // Process each account
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
              addLabelToThread(accountId, accountThreads, labelId);
            } else {
              removeLabelFromThread(accountId, accountThreads, labelId);
            }
          }
        }
      } catch (error) {
        console.error(`Failed to toggle label ${labelName}`, error);
      }
    },
    [selectedThreadsData, labelsMapByAccount, addLabelToThread, removeLabelFromThread, bounce]
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
        className={cn(
          'h-[0px] origin-top transition-all duration-200 ease-bouncy-in-out',
          loading ? '' : `h-[${listHeight}px]`
        )}
        style={{ transition: 'height 300ms', height: `${listHeight}px` }}
      >
        <div ref={commandListRef}>
          <CommandEmpty>{t('command_palette.label.no_labels_found')}</CommandEmpty>

          {selectedThreadsData.length > 0 && filteredLabels.length > 0 && (
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
                            <MonoIcon type={'Plus'} className="mr-2 h-4 w-4" />
                            <div className="flex flex-col">
                              <span>
                                {label.name.replace('Mono/', '')} -{' '}
                                {t('command_palette.label.create_in_accounts', {
                                  count: missingAccountsWithThreads.length
                                })}
                              </span>
                              <span className="text-xs text-muted-foreground">
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

                  // Create detailed account information
                  const totalThreads = accountsInfo.reduce(
                    (sum, info) => sum + info.threadCount,
                    0
                  );
                  const accountDetails = accountsInfo
                    .map((info) => `${info.email} (${info.threadCount})`)
                    .join(', ');

                  return (
                    <CommandItem
                      key={`${label.name}-${accountIds.join('-')}`}
                      variant={'raycast'}
                      value={label.name}
                      onSelect={() => handleLabelToggle(label.name, checkState, accountsInfo)}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div
                          className="ml-2 mr-4 flex h-[20px] w-[5.5px] items-center justify-center rounded-sm"
                          style={{ backgroundColor: label.color.backgroundColor }}
                        ></div>
                        <div className="flex w-full items-center justify-between">
                          <div className="flex w-full flex-col">
                            <span>{label.name.replace('Mono/', '')}</span>
                            <span className="text-xs text-muted-foreground">
                              {/* {
                                t(
                                  'command_palette.label.will_affect_conversations_plural_accounts',
                                  {
                                    count: totalThreads,
                                    accountCount: accountsInfo.length
                                  }
                                )} */}
                            </span>
                          </div>
                          {checkState === 'checked' ? (
                            <MonoIcon type={'CheckCircle'} className="mr-2" />
                          ) : checkState === 'partial' ? (
                            <MonoIcon type={'Minus'} className="mr-2" />
                          ) : null}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </div>
      </CommandList>
    </div>
  );
};

export default LabelCommandPage;
