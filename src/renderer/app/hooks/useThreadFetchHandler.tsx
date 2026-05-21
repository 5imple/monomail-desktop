import { apiClient } from '@/main/api/apiClient';
import { UserPreference } from '@/main/api/auth/types/user';
import mailApi from '@/main/api/mail/mailApi';
import { MonoThread } from '@/main/models/thread/MonoThread';
import { authCache } from '@/renderer/app/context/AuthCache';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { UpdateType, useMessage } from '@/renderer/app/context/MessageContext';
import { useSyncHistory } from '@/renderer/app/context/SyncHistoryContext';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
import { convertToAccurateQuery } from '@/renderer/app/lib/convertToAccurateQuery';
import { DBGetAllDraftThreadsMultiUser } from '@/renderer/app/lib/db/draft';
import {
  DBGetAllThreadsMultiUser,
  DBGetThread,
  DBGetThreadsByLabelMultiUser,
  isPrimaryThread,
  ValidLabel,
  validLabels
} from '@/renderer/app/lib/db/thread';
import { DBCustomSearchThreadsMultiUser } from '@/renderer/app/lib/db/thread/customSearch';
import { parseQueryFieldLabel } from '@/renderer/app/lib/queryUtils';
import { updateBadgeWithLabelCount } from '@/renderer/app/lib/updateAppBadgeWithThread';
// useBillingAtom removed — payment-free build.
import { useThreadListAtom } from '@/renderer/app/store/layout/threadList/useThreadListAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadOperationAtom } from '@/renderer/app/store/thread/useThreadOperations';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OperationPriority, useThreadOperationsQueue } from './useThreadOperationsQueue';

const useThreadFetchHandler = () => {
  const FETCH_THREADS_LIMIT = 25;
  // Track last timestamp per query for pagination
  const [lastTimestamps, setLastTimestamps] = useState<Record<string, number | undefined>>({});
  // Track which queries have finished loading
  const [queriesLoaded, setQueriesLoaded] = useState<Record<string, boolean>>({});
  const [lastQuery, setLastQuery] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { globalSearchQuery } = useGlobalAtom();
  const { loadingStatus, setLoadingStatus } = useThreadListAtom();
  const { filteredThreadIds: threadIds, setThreadIds, setThreadsMap, threadsMap } = useThreadAtom();
  const { setThreads, resetThreadsMap } = useThreadOperationAtom();
  const [hasMore, setHasMore] = useState(true);
  const { activeSpace } = useSpaceAtom();
  // Payment-free build — no plan gates.
  const { accounts, preference } = useAuth();

  // Refs to track latest state values
  const threadIdsRef = useRef(threadIds);
  const threadsMapRef = useRef(threadsMap);
  const globalSearchQueryRef = useRef(globalSearchQuery);
  const lastTimestampsRef = useRef(lastTimestamps);
  const loadingStatusRef = useRef(loadingStatus);

  // Update refs when state changes
  useEffect(() => {
    threadIdsRef.current = threadIds;
  }, [threadIds]);
  useEffect(() => {
    threadsMapRef.current = threadsMap;
  }, [threadsMap]);
  useEffect(() => {
    globalSearchQueryRef.current = globalSearchQuery;
  }, [globalSearchQuery]);
  useEffect(() => {
    lastTimestampsRef.current = lastTimestamps;
  }, [lastTimestamps]);
  useEffect(() => {
    loadingStatusRef.current = loadingStatus;
  }, [loadingStatus]);

  // Initialize our priority queue
  const { enqueueOperation } = useThreadOperationsQueue();

  // Store activeSpace in a ref to always have the latest value
  const activeSpaceRef = useRef(activeSpace);
  const [needPayment, setNeedPayment] = useState(false);
  const { syncThreads, abortSync } = useSyncThread();
  const { syncThreadHistory, subscribe: historySubscribe } = useSyncHistory();
  const { subscribe: messageSubscribe } = useMessage();
  const apiCallsRef = useRef<AbortController | null>(null);
  const cacheOffsetRef = useRef<number>(0);
  const [pageTokens, setPageTokens] = useState<Record<string, Record<string, string | undefined>>>(
    {}
  );
  const pageTokensRef = useRef(pageTokens);
  useEffect(() => {
    pageTokensRef.current = pageTokens;
  }, [pageTokens]);
  const prevActiveAccountUidsRef = useRef<string[]>([]);

  const [needsFullSync, setNeedsFullSync] = useState<Record<string, boolean>>({});

  const [historySyncInitialized, setHistorySyncInitialized] = useState<Record<string, boolean>>({});

  // Update the ref whenever activeSpace changes
  useEffect(() => {
    if (
      activeSpace &&
      (activeSpace.id !== activeSpaceRef.current?.id ||
        activeSpace?.activeAccountUids !== activeSpaceRef.current?.activeAccountUids)
    )
      activeSpaceRef.current = activeSpace;
  }, [activeSpace]);

  // Helper function to get limited account UIDs based on user plan and account status
  const getLimitedAccountUids = useCallback(() => {
    const currentActiveSpace = activeSpaceRef.current;
    if (!currentActiveSpace?.activeAccountUids?.length) return [];

    // Payment-free build — every active account is allowed; no 2-account
    // free-plan cap to enforce.
    const validAccounts = currentActiveSpace.activeAccountUids.filter((uid) =>
      accounts.some((acc) => acc.uid === uid)
    );

    return validAccounts;
  }, [activeSpaceRef, accounts]);

  useEffect(() => {
    // Skip on initial mount
    if (prevActiveAccountUidsRef.current.length === 0 && activeSpace?.activeAccountUids) {
      prevActiveAccountUidsRef.current = [...activeSpace.activeAccountUids];
      return;
    }

    if (activeSpace?.activeAccountUids) {
      const limitedAccountUids = getLimitedAccountUids();
      const prevLimitedAccountUids = prevActiveAccountUidsRef.current;

      // Find accounts that are no longer in the limited set
      const removedAccounts = prevLimitedAccountUids.filter(
        (uid) => !limitedAccountUids.includes(uid)
      );

      // Abort sync for accounts that were removed from limited accounts
      if (removedAccounts.length > 0) {
        abortSync(removedAccounts);
        setLoadingStatus('INIT');
      }

      // Update ref with current limited accounts
      prevActiveAccountUidsRef.current = [...limitedAccountUids];
    }
  }, [activeSpace?.activeAccountUids, abortSync]);

  // const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  const YEAR_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 60 days in milliseconds
  const currentTimeMs = Date.now();
  const checkThreadAge = useCallback(
    (threads) => {
      // Skip check for subscribed users
      const currentActiveSpace = activeSpaceRef.current;
      if (!currentActiveSpace?.activeAccountUids?.length) return false;

      // Payment-free build — never gate by thread age.
      return false;

      // For free users, check if the newest thread is older than 60 days
      if (threads.length > 0) {
        // Get the newest thread (highest timestamp)
        const newestThread = threads.reduce(
          (newest, thread) => (thread.timestamp > newest.timestamp ? thread : newest),
          threads[0]
        );

        const threadAgeMs = currentTimeMs - newestThread.timestamp;
        return threadAgeMs > YEAR_DAYS_MS;
      }

      return false;
    },
    [accounts, activeSpaceRef, currentTimeMs]
  );

  // Classify query to determine best search strategy
  const classifySearchQuery = useCallback((query: string) => {
    const { field, label } = parseQueryFieldLabel(query, true);

    // Check if it's a valid predefined query (including "in:all")
    const isValidLabel =
      (field === 'in' || field === 'is' || field === 'category') &&
      (validLabels.includes(label.toUpperCase() as ValidLabel) || label.toLowerCase() === 'all');

    // Check if it's a draft query
    const isDraft = label === 'draft';

    // Check if it contains search operators or is a complex query
    const hasOperators = /(-?)(from|to|subject|cc|bcc|label|has|is|in):/i.test(query);
    const hasSearchTerms =
      query.replace(/(-?)(from|to|subject|cc|bcc|label|has|is|in):[^\s]+/gi, '').trim().length > 0;

    // Determine search strategy
    if (isDraft) {
      return { strategy: 'draft', isValidLabel, hasOperators, hasSearchTerms };
    } else if (isValidLabel && !hasSearchTerms && !hasOperators) {
      return { strategy: 'cache-only', isValidLabel, hasOperators, hasSearchTerms };
    } else if (hasOperators || hasSearchTerms) {
      return { strategy: 'hybrid', isValidLabel, hasOperators, hasSearchTerms };
    } else {
      return { strategy: 'api-only', isValidLabel, hasOperators, hasSearchTerms };
    }
  }, []);

  // Helper function to check if a thread belongs to a specific category
  const threadMatchesCategory = useCallback(
    (thread: MonoThread, categoryName: string, preference: UserPreference): boolean => {
      if (!thread) return false;

      switch (categoryName.toUpperCase()) {
        case 'PRIMARY':
          return isPrimaryThread(thread, preference);
        case 'SOCIAL':
          return thread.labelIds.includes('CATEGORY_SOCIAL');
        case 'PROMOTIONS':
          return thread.labelIds.includes('CATEGORY_PROMOTIONS');
        case 'UPDATES':
          return thread.labelIds.includes('CATEGORY_UPDATES');
        case 'FORUMS':
          return thread.labelIds.includes('CATEGORY_FORUMS');
        default:
          return thread.labelIds.includes(categoryName);
      }
    },
    []
  );

  const resetThreadsArray = useCallback(() => {
    enqueueOperation(
      async () => {
        setThreadIds([]);
        // Reset timestamp and loaded state
        setLastTimestamps({});
        setQueriesLoaded({});
        setPageTokens({});
        cacheOffsetRef.current = 0;
      },
      {
        priority: OperationPriority.HIGH,
        type: 'reset-threads-array',
        batch: false
      }
    );
  }, [setThreadIds, enqueueOperation]);

  const updateThreadIds = useCallback(
    (newThreads: string[]) => {
      enqueueOperation(
        async () => {
          setThreadIds((prev) => {
            // Start with previous thread IDs
            const allThreadIds = [...prev];

            // Add new thread IDs if they don't already exist
            newThreads.forEach((id) => {
              if (!allThreadIds.includes(id)) {
                allThreadIds.push(id);
              }
            });

            // Sort all threads by timestamp (newest first)
            return allThreadIds.sort((idA, idB) => {
              const threadA = threadsMapRef.current[idA];
              const threadB = threadsMapRef.current[idB];

              // Handle cases where thread data might not be available yet
              if (!threadA && !threadB) return 0;
              if (!threadA) return 1; // Put threads without data at the end
              if (!threadB) return -1;

              // Sort by timestamp (descending order - newest first)
              return threadB.timestamp - threadA.timestamp;
            });
          });
        },
        {
          priority: OperationPriority.MEDIUM,
          type: 'update-thread-ids',
          batch: true,
          batchKey: 'update-thread-ids',
          data: { newThreads }
        }
      );
    },
    [setThreadIds, enqueueOperation, threadsMapRef]
  );

  // Implementation of updateFromMessageSubscribe with space awareness and category handling
  const updateFromMessageSubscribe = useCallback(
    async (updates: UpdateType[]) => {
      // Skip if no updates
      if (!updates || updates.length === 0) return;

      // Get active space
      const currentActiveSpace = activeSpaceRef.current;
      if (!currentActiveSpace) return;

      // Get limited account IDs based on user plan
      const activeAccountUids = getLimitedAccountUids();

      // Filter updates for accounts that are active and within plan limits
      const relevantUpdates = updates.filter((update) =>
        activeAccountUids.includes(update.accountId)
      );

      if (relevantUpdates.length === 0) return;

      // Group updates by account for batching
      const updatesByAccount = relevantUpdates.reduce<Record<string, UpdateType[]>>(
        (acc, update) => {
          if (!acc[update.accountId]) acc[update.accountId] = [];
          acc[update.accountId].push(update);
          return acc;
        },
        {}
      );

      // Process updates for each account
      Object.entries(updatesByAccount).forEach(([accountId, accountUpdates]) => {
        enqueueOperation(
          async () => {
            const currentQuery = globalSearchQueryRef.current || 'in:inbox';
            const { field, label } = parseQueryFieldLabel(currentQuery, true);

            const isValidQuery =
              (field === 'in' || field === 'is' || field === 'category') &&
              (validLabels.includes(label.toUpperCase() as ValidLabel) ||
                label.toLowerCase() === 'all');

            const authCacheData = await authCache.getCachedData();
            const preference = authCacheData?.preference;
            if (!preference) {
              return;
            }

            // Create batches of threads to update
            const threadsToAdd: string[] = [];
            const threadsToRemove: string[] = [];
            const accountThreadsToUpdate: MonoThread[] = [];

            // Process each update
            for (const { type, threadId } of accountUpdates) {
              // Get the thread from the database

              switch (type) {
                case 'updated': {
                  const thread = await DBGetThread(accountId, threadId);
                  if (!thread) continue;
                  // Add thread to our update batch
                  accountThreadsToUpdate.push(thread);

                  // Handle thread visibility based on query type
                  if (isValidQuery) {
                    let shouldShow = false;
                    if (label.toLowerCase() === 'all') {
                      // For "in:all", show everything except trash threads
                      shouldShow = !thread.labelIds.includes('TRASH');
                    } else if (field === 'category') {
                      // Handle category queries
                      shouldShow = threadMatchesCategory(thread, label, preference);
                    } else {
                      // Handle regular label queries
                      shouldShow = thread.labelIds.includes(label.toUpperCase());
                    }
                    const isCurrentlyShown = threadIdsRef.current.includes(threadId);

                    if (shouldShow && !isCurrentlyShown) {
                      // Add thread to list because it now matches the filter
                      threadsToAdd.push(threadId);
                    }
                    if (!shouldShow) {
                      // Remove thread from list because it no longer matches the filter
                      threadsToRemove.push(threadId);
                    }
                  }
                  break;
                }

                case 'added': {
                  const thread = await DBGetThread(accountId, threadId);

                  if (!thread) continue;
                  // Add thread to our update batch
                  accountThreadsToUpdate.push(thread);

                  // Check if thread matches current filter
                  let shouldShow = false;

                  if (field === 'category') {
                    // Handle category queries
                    shouldShow = threadMatchesCategory(thread, label, preference);
                  } else if (isValidQuery) {
                    // Handle regular label queries
                    if (label.toLowerCase() === 'all') {
                      // For "in:all", show everything except trash threads
                      shouldShow = !thread.labelIds.includes('TRASH');
                    } else {
                      shouldShow = thread.labelIds.includes(label.toUpperCase());
                    }
                  }

                  const isCurrentlyShown = threadIdsRef.current.includes(threadId);

                  if (shouldShow && !isCurrentlyShown) {
                    threadsToAdd.push(threadId);
                  }
                  break;
                }

                case 'removed': {
                  const thread = await DBGetThread(accountId, threadId);
                  if (!thread) continue;
                  // For "in:all", only remove if thread is moved to trash
                  if (
                    (isValidQuery &&
                      label.toLowerCase() !== 'all' &&
                      threadIdsRef.current.includes(threadId)) ||
                    (label.toLowerCase() === 'all' &&
                      threadIdsRef.current.includes(threadId) &&
                      thread.labelIds.includes('TRASH'))
                  ) {
                    threadsToRemove.push(threadId);
                  }
                  break;
                }

                default:
                  break;
              }
            }

            // Now apply all batched updates

            // 1. Update threads map with all threads at once
            if (accountThreadsToUpdate.length > 0) {
              await setThreads(accountId, accountThreadsToUpdate, false, false);
            }

            // 2. Add threads to the thread list
            if (threadsToAdd.length > 0) {
              // Instead of manual position calculation, use our global sorting function
              updateThreadIds(threadsToAdd);
            }
            // 3. Remove threads from the thread list
            if (threadsToRemove.length > 0) {
              setThreadIds((prev) => prev.filter((id) => !threadsToRemove.includes(id)));

              // Also clean up threadsMap for removed threads
              if (threadsToRemove.length > 0) {
                setThreadsMap((prev) => {
                  const newMap = { ...prev };
                  threadsToRemove.forEach((id) => {
                    delete newMap[id];
                  });
                  return newMap;
                });
              }
            }
          },
          {
            priority: OperationPriority.LOW,
            type: 'process-message-updates',
            batch: true,
            batchKey: `message-updates-${accountId}`,
            batchDelay: 150,
            data: { accountId, updates: accountUpdates }
          }
        );
      });
    },
    [
      threadIdsRef,
      globalSearchQueryRef,
      threadsMapRef,
      threadMatchesCategory,
      setThreadIds,
      setThreadsMap,
      setThreads,
      enqueueOperation
    ]
  );

  // Fetch threads using the multi-user functions
  const fetchThreadsHandler = useCallback(
    async (loadMore = false) => {
      enqueueOperation(
        async () => {
          setLoadingStatus('LOADING');
          if (!loadMore) {
            setLastQuery(globalSearchQueryRef.current);
          }

          // Abort previous API call if exists
          if (apiCallsRef.current) {
            apiCallsRef.current.abort();
          }
          const abortController = new AbortController();
          apiCallsRef.current = abortController;

          const currentQuery = globalSearchQueryRef.current;
          const queryKey = currentQuery || 'default';
          const { field, label } = parseQueryFieldLabel(currentQuery);

          // Reset pagination if query changed and not loading more
          if (currentQuery !== lastQuery && !loadMore) {
            setLastTimestamps((prev) => ({ ...prev, [queryKey]: undefined }));
            setQueriesLoaded((prev) => ({ ...prev, [queryKey]: false }));
            setPageTokens({});
            cacheOffsetRef.current = 0;
          }

          let threads: MonoThread[] = [];
          try {
            // Determine if this is a valid label query that can use cache
            const isValidLabel =
              (field === 'in' || field === 'is' || field === 'category') &&
              (validLabels.includes(label.toUpperCase() as ValidLabel) ||
                label.toLowerCase() === 'all');
            // Get limited account IDs based on user plan
            const activeAccountUids = getLimitedAccountUids();

            if (activeAccountUids.length === 0) {
              setLoadingStatus('DONE');
              setHasMore(false);
              return;
            }

            if (label === 'draft') {
              // Use the multi-user draft threads function
              threads = await DBGetAllDraftThreadsMultiUser(
                activeAccountUids,
                label,
                FETCH_THREADS_LIMIT,
                loadMore ? lastTimestampsRef.current[queryKey] : undefined
              );

              if (!abortController.signal.aborted) {
                if (threads.length > 0) {
                  // Update cache offset for load more tracking
                  cacheOffsetRef.current += threads.length;

                  // Group threads by user ID
                  const threadsByUser = threads.reduce(
                    (acc, thread) => {
                      // Get userId from the non-enumerable property we added
                      const userId =
                        Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                      if (!acc[userId]) acc[userId] = [];
                      acc[userId].push(thread);
                      return acc;
                    },
                    {} as Record<string, MonoThread[]>
                  );

                  // Update threads for each user
                  Object.entries(threadsByUser).forEach(([userId, userThreads]) => {
                    // Always set replace to false when handling multiple users
                    setThreads(userId, userThreads, false, false);
                  });

                  // Update thread IDs in the global state
                  const newThreadIds = threads.map((thread) => thread.id);
                  updateThreadIds(newThreadIds);

                  // Update the last timestamp for pagination
                  const oldestTimestamp = Math.min(...threads.map((thread) => thread.timestamp));
                  setLastTimestamps((prev) => ({ ...prev, [queryKey]: oldestTimestamp }));

                  // Check if we might have more results
                  setHasMore(threads.length === FETCH_THREADS_LIMIT);
                } else {
                  // No more results
                  setQueriesLoaded((prev) => ({ ...prev, [queryKey]: true }));
                  setHasMore(false);
                }
                setLoadingStatus('DONE');
              }
            } else if (isValidLabel) {
              if (label.toLowerCase() === 'all') {
                // Special handling for 'in:all' query
                threads = await DBGetAllThreadsMultiUser(
                  activeAccountUids,
                  FETCH_THREADS_LIMIT, // Reduced from 50 since we're supplementing local results
                  loadMore ? lastTimestampsRef.current[queryKey] : undefined
                );
              } else {
                // Regular label-based query
                threads = await DBGetThreadsByLabelMultiUser(
                  activeAccountUids,
                  label,
                  FETCH_THREADS_LIMIT, // Reduced from 50 since we're supplementing local results
                  loadMore ? lastTimestampsRef.current[queryKey] : undefined
                );
              }

              if (!abortController.signal.aborted) {
                const isLimited = checkThreadAge(threads);
                if (threads.length > 0) {
                  // Update cache offset for load more tracking
                  cacheOffsetRef.current += threads.length;

                  // Group threads by user ID
                  const threadsByUser = threads.reduce(
                    (acc, thread) => {
                      // Get userId from the non-enumerable property we added
                      const userId =
                        Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                      if (!acc[userId]) acc[userId] = [];
                      acc[userId].push(thread);
                      return acc;
                    },
                    {} as Record<string, MonoThread[]>
                  );

                  // Update threads for each user
                  Object.entries(threadsByUser).forEach(([userId, userThreads]) => {
                    // Always set replace to false when handling multiple users
                    setThreads(userId, userThreads, false, false);
                  });

                  // Update thread IDs in the global state
                  const newThreadIds = threads.map((thread) => thread.id);
                  updateThreadIds(newThreadIds);

                  // Update the last timestamp for pagination
                  const oldestTimestamp = Math.min(...threads.map((thread) => thread.timestamp));
                  setLastTimestamps((prev) => ({ ...prev, [queryKey]: oldestTimestamp }));

                  // Check if we might have more results

                  if (isLimited) {
                    setNeedPayment(true);
                    setLoadingStatus('ERROR');
                  }
                  setHasMore(!isLimited && threads.length === FETCH_THREADS_LIMIT);
                } else {
                  // No more results
                  setQueriesLoaded((prev) => ({ ...prev, [queryKey]: true }));
                  setHasMore(false);
                }
                setLoadingStatus('DONE');
                if (!isLimited) setLoadingStatus('DONE');
              }
            } else {
              // NEW: Use hybrid search strategy for custom queries
              const searchClassification = classifySearchQuery(currentQuery);

              if (
                searchClassification.strategy === 'hybrid' ||
                searchClassification.hasSearchTerms
              ) {
                // NEW APPROACH: Always try local search first for immediate results
                console.log(`Starting local search for query: "${currentQuery}"`);
                console.log('limitedAccountUids: ', activeAccountUids);
                try {
                  // 1. IMMEDIATE LOCAL SEARCH - Show results ASAP
                  const localResults = await DBCustomSearchThreadsMultiUser(
                    activeAccountUids,

                    currentQuery,
                    {
                      limit: FETCH_THREADS_LIMIT,
                      lastTimestamp: loadMore ? lastTimestampsRef.current[queryKey] : undefined,
                      searchType: 'fuzzy',
                      searchFields: ['subject', 'snippet', 'from', 'to', 'cc'],
                      minScore: 0.1 // Lower threshold for immediate results
                    }
                  );

                  console.log(
                    `Local search found ${localResults.threads.length} results immediately`
                  );

                  // Show local results immediately if we have any
                  if (localResults.threads.length > 0) {
                    threads = localResults.threads;

                    // Update UI immediately with local results
                    if (!abortController.signal.aborted) {
                      cacheOffsetRef.current += threads.length;

                      // Group threads by user ID (accountId property is set by DBCustomSearchThreadsMultiUser)
                      // This ensures threads are saved to the correct account's database
                      const threadsByUser = threads.reduce(
                        (acc, thread) => {
                          const userId =
                            Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                          if (!acc[userId]) acc[userId] = [];
                          acc[userId].push(thread);
                          return acc;
                        },
                        {} as Record<string, MonoThread[]>
                      );

                      // Update threads for each user (no need to save to DB yet, wait for API supplement)
                      Object.entries(threadsByUser).forEach(([userId, userThreads]) => {
                        setThreads(userId, userThreads, false, false); // saveToLocal=false, will save after API supplement
                      });

                      // Update thread IDs in the global state IMMEDIATELY (no batching for immediate local results)
                      const newThreadIds = threads.map((thread) => thread.id);
                      setThreadIds((prev) => {
                        // Start with previous thread IDs
                        const allThreadIds = [...prev];

                        // Add new thread IDs if they don't already exist
                        newThreadIds.forEach((id) => {
                          if (!allThreadIds.includes(id)) {
                            allThreadIds.push(id);
                          }
                        });

                        // Sort all threads by timestamp (newest first)
                        return allThreadIds.sort((idA, idB) => {
                          const threadA = threadsMapRef.current[idA];
                          const threadB = threadsMapRef.current[idB];

                          // Handle cases where thread data might not be available yet
                          if (!threadA && !threadB) return 0;
                          if (!threadA) return 1; // Put threads without data at the end
                          if (!threadB) return -1;

                          // Sort by timestamp (descending order - newest first)
                          return threadB.timestamp - threadA.timestamp;
                        });
                      });

                      // Update the last timestamp for pagination
                      const oldestTimestamp = Math.min(
                        ...threads.map((thread) => thread.timestamp)
                      );
                      setLastTimestamps((prev) => ({ ...prev, [queryKey]: oldestTimestamp }));

                      // Force UI update by setting loading status
                      setLoadingStatus(threads.length === FETCH_THREADS_LIMIT ? 'DONE' : 'LOADING');
                      setHasMore(threads.length === FETCH_THREADS_LIMIT);

                      console.log(`✅ Displayed ${threads.length} local results immediately`);
                    }
                  } else {
                    // No local results found, but we'll still try API search
                    console.log(`🔍 No local results found, will rely on API search`);
                    threads = []; // Initialize empty threads array
                  }

                  // 2. BACKGROUND API SEARCH - Supplement with API results
                  // Only run API search if we have few local results or user wants comprehensive results
                  const shouldRunAPISearch =
                    localResults.threads.length < FETCH_THREADS_LIMIT ||
                    searchClassification.hasOperators;

                  if (shouldRunAPISearch && !abortController.signal.aborted) {
                    console.log(
                      `🔄 Running background API search to supplement ${localResults.threads.length} local results`
                    );

                    // Create API search function
                    const fetchAPIResults = async (): Promise<MonoThread[]> => {
                      const fetchWithRetry = async (
                        accountId: string,
                        maxRetries = 3,
                        baseDelay = 1000
                      ) => {
                        const accountQueryKey = `${accountId}-${queryKey}`;
                        const pageToken = loadMore
                          ? pageTokensRef.current[accountQueryKey]?.[queryKey] || undefined
                          : undefined;

                        const q = convertToAccurateQuery(
                          currentQuery,
                          preference.display.inbox.category?.[accountId] || {
                            showUpdates: true,
                            showSocial: true,
                            showPromotions: true,
                            showForums: true
                          }
                        );
                        apiClient.setApiActiveUid(accountId);

                        for (let attempt = 0; attempt <= maxRetries; attempt++) {
                          try {
                            const response = await mailApi.getThreads(
                              accountId,
                              q,
                              pageToken,
                              FETCH_THREADS_LIMIT.toString(), // Reduced from 50 since we're supplementing local results
                              abortController.signal
                            );

                            if (!abortController.signal.aborted) {
                              if (response.nextPageToken) {
                                setPageTokens((prev) => ({
                                  ...prev,
                                  [accountQueryKey]: {
                                    ...(prev[accountQueryKey] || {}),
                                    [queryKey]: response.nextPageToken
                                  }
                                }));
                              }

                              if (response.threads && response.threads.length > 0) {
                                const accountThreads = response.threads.map((thread) =>
                                  MonoThread.fromPlainObject(thread)
                                );
                                return {
                                  accountId,
                                  threads: accountThreads,
                                  hasMore: !!response.nextPageToken,
                                  status: 'success'
                                };
                              }
                            }
                            return {
                              accountId,
                              threads: [],
                              hasMore: false,
                              status: 'success'
                            };
                          } catch (error: any) {
                            const statusCode = error?.status || 500;

                            if (attempt === maxRetries || statusCode !== 429) {
                              throw error;
                            }

                            if (statusCode === 429) {
                              const retryAfter =
                                error?.headers?.['retry-after'] ||
                                error?.response?.headers?.['retry-after'];
                              let delay = baseDelay * Math.pow(2, attempt);

                              if (retryAfter) {
                                delay = parseInt(retryAfter) * 1000;
                              } else {
                                delay += Math.random() * 1000;
                              }

                              console.warn(
                                `Rate limited for account ${accountId}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`
                              );

                              await new Promise((resolve) => setTimeout(resolve, delay));
                              continue;
                            }
                          }
                        }

                        throw new Error('Max retries exceeded');
                      };

                      const accountsResults = await Promise.all(
                        activeAccountUids.map(async (accountId) => {
                          try {
                            return await fetchWithRetry(accountId);
                          } catch (error: any) {
                            const statusCode = error?.status || 500;
                            console.error(
                              `Error fetching threads for account ${accountId}:`,
                              error?.data?.message
                            );

                            if (statusCode === 402) {
                              return {
                                accountId,
                                threads: [],
                                hasMore: false,
                                status: 'payment_required'
                              };
                            }

                            if (statusCode === 429) {
                              return {
                                accountId,
                                threads: [],
                                hasMore: false,
                                status: 'rate_limited',
                                errorMessage: 'Rate limit exceeded. Please try again later.'
                              };
                            }

                            return {
                              accountId,
                              threads: [],
                              hasMore: false,
                              status: 'error',
                              errorMessage: error?.data?.message || 'Unknown error'
                            };
                          }
                        })
                      );

                      const paymentRequiredAccounts = accountsResults.filter(
                        (result) => result.status === 'payment_required'
                      );
                      const successfulAccounts = accountsResults.filter(
                        (result) => result.status === 'success'
                      );

                      if (paymentRequiredAccounts.length > 0) {
                        setNeedPayment(true);
                      }

                      const allThreads = successfulAccounts.flatMap((result) => result.threads);
                      return allThreads.sort((a, b) => b.timestamp - a.timestamp);
                    };

                    // Run API search in background
                    try {
                      const apiThreads = await fetchAPIResults();

                      if (!abortController.signal.aborted && apiThreads.length > 0) {
                        console.log(
                          `💾 Saving ${apiThreads.length} API results to database for future searches`
                        );

                        // SAVE API RESULTS TO DATABASE FIRST
                        // Group all API threads by user ID for database storage
                        const allAPIThreadsByUser = apiThreads.reduce(
                          (acc, thread) => {
                            const userId =
                              Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                            if (!acc[userId]) acc[userId] = [];
                            acc[userId].push(thread);
                            return acc;
                          },
                          {} as Record<string, MonoThread[]>
                        );

                        // Save all API threads to database immediately (parallel operations)
                        const savePromises = Object.entries(allAPIThreadsByUser).map(
                          async ([userId, userThreads]) => {
                            try {
                              // Save to database with replace=false to avoid overwriting existing data
                              await setThreads(userId, userThreads, false, true); // saveToLocal=true
                              console.log(
                                `💾 Saved ${userThreads.length} threads to database for account ${userId}`
                              );
                            } catch (saveError) {
                              console.error(
                                `Failed to save threads for account ${userId}:`,
                                saveError
                              );
                            }
                          }
                        );

                        // Wait for all database saves to complete
                        await Promise.all(savePromises);
                        console.log(`✅ All API results saved to database`);

                        // THEN UPDATE UI STATE
                        // Combine with existing local results, removing duplicates
                        const existingThreadIds = new Set(threads.map((t) => t.id));
                        const newAPIThreads = apiThreads.filter(
                          (t) => !existingThreadIds.has(t.id)
                        );

                        console.log(
                          `🔍 Debug: existingThreadIds.size=${existingThreadIds.size}, apiThreads.length=${apiThreads.length}, newAPIThreads.length=${newAPIThreads.length}`
                        );

                        if (newAPIThreads.length > 0 || localResults.threads.length === 0) {
                          console.log(
                            `📈 Found ${newAPIThreads.length} additional API results to supplement ${localResults.threads.length} local results`
                          );

                          // Merge and re-sort all threads
                          const combinedThreads = [...threads, ...newAPIThreads]
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .slice(0, FETCH_THREADS_LIMIT);

                          // Group new threads by user ID for UI state update (no database save needed)
                          const newThreadsByUser = newAPIThreads.reduce(
                            (acc, thread) => {
                              const userId =
                                Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                              if (!acc[userId]) acc[userId] = [];
                              acc[userId].push(thread);
                              return acc;
                            },
                            {} as Record<string, MonoThread[]>
                          );

                          // Update UI state only (skipSave since we already saved above)
                          Object.entries(newThreadsByUser).forEach(([userId, userThreads]) => {
                            setThreads(userId, userThreads, false, false); // saveToLocal=false since already saved
                          });

                          // Update thread IDs with combined results
                          const allThreadIds = combinedThreads.map((thread) => thread.id);
                          updateThreadIds(allThreadIds);

                          // Update final thread list
                          threads = combinedThreads;

                          // Update pagination state for combined results
                          const oldestTimestamp = Math.min(
                            ...combinedThreads.map((thread) => thread.timestamp)
                          );
                          setLastTimestamps((prev) => ({ ...prev, [queryKey]: oldestTimestamp }));
                          setHasMore(combinedThreads.length === FETCH_THREADS_LIMIT);

                          setLoadingStatus(
                            combinedThreads.length === FETCH_THREADS_LIMIT ? 'DONE' : 'LOADING'
                          );

                          console.log(
                            `✅ Final result: ${threads.length} threads (${localResults.threads.length} local + ${newAPIThreads.length} API, all saved to DB)`
                          );

                          // Final save of complete combined results to ensure everything is in DB
                          const finalThreadsByUser = combinedThreads.reduce(
                            (acc, thread) => {
                              const userId =
                                Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                              if (!acc[userId]) acc[userId] = [];
                              acc[userId].push(thread);
                              return acc;
                            },
                            {} as Record<string, MonoThread[]>
                          );

                          // Final database save for complete result set
                          Object.entries(finalThreadsByUser).forEach(([userId, userThreads]) => {
                            setThreads(userId, userThreads, false, false); // Final save with saveToLocal=true
                          });
                        }
                        setLoadingStatus('DONE');
                      } else {
                        // No API results or aborted
                        console.log(`🔍 No API results found or request was aborted`);
                        if (localResults.threads.length === 0) {
                          // No local results and no API results
                          setHasMore(false);
                        }
                        setLoadingStatus('DONE');
                      }
                    } catch (apiError) {
                      console.warn('API search failed, using local results only:', apiError);
                      // Keep using local results if API fails
                    }
                  } else {
                    console.log(
                      `✅ Using local results only (${localResults.threads.length} results, sufficient for user needs)`
                    );

                    // Ensure local-only results are also saved to DB for future searches
                    if (localResults.threads.length > 0) {
                      const localThreadsByUser = localResults.threads.reduce(
                        (acc, thread) => {
                          const userId =
                            Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                          if (!acc[userId]) acc[userId] = [];
                          acc[userId].push(thread);
                          return acc;
                        },
                        {} as Record<string, MonoThread[]>
                      );

                      // Save local results to database
                      Object.entries(localThreadsByUser).forEach(([userId, userThreads]) => {
                        setThreads(userId, userThreads, false, true); // saveToLocal=true
                      });

                      console.log(
                        `💾 Ensured ${localResults.threads.length} local results are saved to database`
                      );
                    }

                    // Update final state for local-only results
                    setHasMore(localResults.threads.length === FETCH_THREADS_LIMIT);
                    setLoadingStatus(
                      localResults.threads.length === FETCH_THREADS_LIMIT ? 'DONE' : 'LOADING'
                    );
                  }
                } catch (localError) {
                  console.error('Local search failed, falling back to API only:', localError);
                  // Fall through to API-only approach below
                }

                // Return early to prevent falling through to API-only section
                return;
              } else {
                // Fallback to original API-only strategy
                const fetchWithRetry = async (
                  accountId: string,
                  maxRetries = 3,
                  baseDelay = 1000
                ) => {
                  const accountQueryKey = `${accountId}-${queryKey}`;
                  const pageToken = loadMore
                    ? pageTokensRef.current[accountQueryKey]?.[queryKey] || undefined
                    : undefined;

                  const q = convertToAccurateQuery(
                    currentQuery,
                    preference.display.inbox.category?.[accountId] || {
                      showUpdates: true,
                      showSocial: true,
                      showPromotions: true,
                      showForums: true
                    }
                  );
                  apiClient.setApiActiveUid(accountId);

                  for (let attempt = 0; attempt <= maxRetries; attempt++) {
                    try {
                      const response = await mailApi.getThreads(
                        accountId,
                        q,
                        pageToken,
                        FETCH_THREADS_LIMIT.toString(), // Reduced from 50 since we're supplementing local results
                        abortController.signal
                      );

                      if (!abortController.signal.aborted) {
                        if (response.nextPageToken) {
                          setPageTokens((prev) => ({
                            ...prev,
                            [accountQueryKey]: {
                              ...(prev[accountQueryKey] || {}),
                              [queryKey]: response.nextPageToken
                            }
                          }));
                        }

                        if (response.threads && response.threads.length > 0) {
                          const accountThreads = response.threads.map((thread) =>
                            MonoThread.fromPlainObject(thread)
                          );
                          return {
                            accountId,
                            threads: accountThreads,
                            hasMore: !!response.nextPageToken,
                            status: 'success'
                          };
                        }
                      }
                      return {
                        accountId,
                        threads: [],
                        hasMore: false,
                        status: 'success'
                      };
                    } catch (error: any) {
                      const statusCode = error?.status || 500;

                      // If this is the last attempt or not a retryable error, throw
                      if (attempt === maxRetries || statusCode !== 429) {
                        throw error;
                      }

                      // For 429 errors, implement exponential backoff with jitter
                      if (statusCode === 429) {
                        // Check for Retry-After header (in seconds)
                        const retryAfter =
                          error?.headers?.['retry-after'] ||
                          error?.response?.headers?.['retry-after'];
                        let delay = baseDelay * Math.pow(2, attempt); // Exponential backoff

                        if (retryAfter) {
                          // If server provides Retry-After, use that (convert to ms)
                          delay = parseInt(retryAfter) * 1000;
                        } else {
                          // Add jitter to prevent thundering herd
                          delay += Math.random() * 1000;
                        }

                        console.warn(
                          `Rate limited for account ${accountId}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`
                        );

                        // Wait for the calculated delay
                        await new Promise((resolve) => setTimeout(resolve, delay));
                        continue;
                      }
                    }
                  }

                  // This should never be reached, but just in case
                  throw new Error('Max retries exceeded');
                };

                // For API-based queries, handle account-level errors gracefully
                const accountsResults = await Promise.all(
                  activeAccountUids.map(async (accountId) => {
                    try {
                      return await fetchWithRetry(accountId);
                    } catch (error: any) {
                      // Track payment errors per account
                      const statusCode = error?.status || 500;
                      console.error(
                        `Error fetching threads for account ${accountId}:`,
                        error?.data?.message
                      );

                      if (statusCode === 402) {
                        // Mark this specific account as needing payment
                        return {
                          accountId,
                          threads: [],
                          hasMore: false,
                          status: 'payment_required'
                        };
                      }

                      if (statusCode === 429) {
                        // Rate limit exceeded even after retries
                        return {
                          accountId,
                          threads: [],
                          hasMore: false,
                          status: 'rate_limited',
                          errorMessage: 'Rate limit exceeded. Please try again later.'
                        };
                      }

                      return {
                        accountId,
                        threads: [],
                        hasMore: false,
                        status: 'error',
                        errorMessage: error?.data?.message || 'Unknown error'
                      };
                    }
                  })
                );

                // Track account statuses
                const paymentRequiredAccounts = accountsResults.filter(
                  (result) => result.status === 'payment_required'
                );
                const rateLimitedAccounts = accountsResults.filter(
                  (result) => result.status === 'rate_limited'
                );
                const errorAccounts = accountsResults.filter((result) => result.status === 'error');
                const successfulAccounts = accountsResults.filter(
                  (result) => result.status === 'success'
                );

                // Determine if we need to set payment flag
                if (paymentRequiredAccounts.length > 0) {
                  setNeedPayment(true);
                }

                // Log rate limited accounts for debugging
                if (rateLimitedAccounts.length > 0) {
                  console.warn(
                    `Rate limited accounts: ${rateLimitedAccounts.map((r) => r.accountId).join(', ')}`
                  );
                }

                // Only use successful results for threads
                const allThreads = successfulAccounts.flatMap((result) => result.threads);
                threads = allThreads.sort((a, b) => b.timestamp - a.timestamp);

                // Apply timestamp filtering for pagination in API results
                if (loadMore && lastTimestampsRef.current[queryKey]) {
                  threads = threads.filter(
                    (thread) => thread.timestamp < lastTimestampsRef.current[queryKey]!
                  );
                }

                // Limit to 50 results for this batch
                threads = threads.slice(0, FETCH_THREADS_LIMIT);
              }

              if (!abortController.signal.aborted) {
                // Set loading status based on results
                if (threads.length > 0) {
                  console.log(
                    `💾 Saving ${threads.length} API-only results to database for future searches`
                  );

                  // Update cache offset for load more tracking
                  cacheOffsetRef.current += threads.length;

                  // Group threads by user ID
                  const threadsByUser = threads.reduce(
                    (acc, thread) => {
                      // Get userId from the non-enumerable property we added
                      const userId =
                        Object.getOwnPropertyDescriptor(thread, 'accountId')?.value || '';
                      if (!acc[userId]) acc[userId] = [];
                      acc[userId].push(thread);
                      return acc;
                    },
                    {} as Record<string, MonoThread[]>
                  );

                  // Save to database AND update UI state
                  Object.entries(threadsByUser).forEach(([userId, userThreads]) => {
                    // Save to database with replace=false to avoid overwriting existing data
                    setThreads(userId, userThreads, false, true); // saveToLocal=true
                    console.log(
                      `💾 Saved ${userThreads.length} API-only threads to database for account ${userId}`
                    );
                  });

                  // Update thread IDs in the global state
                  const newThreadIds = threads.map((thread) => thread.id);
                  updateThreadIds(newThreadIds);

                  // Update the last timestamp for pagination
                  const oldestTimestamp = Math.min(...threads.map((thread) => thread.timestamp));
                  setLastTimestamps((prev) => ({ ...prev, [queryKey]: oldestTimestamp }));

                  // Set hasMore based on whether we have more results
                  setHasMore(threads.length === FETCH_THREADS_LIMIT);
                  setLoadingStatus('DONE');

                  console.log(
                    `✅ ${threads.length} API-only results saved to database and displayed`
                  );
                } else {
                  // No results
                  setQueriesLoaded((prev) => ({ ...prev, [queryKey]: true }));
                  setHasMore(false);
                  setLoadingStatus('DONE');
                }
              }
            }
          } catch (error: any) {
            if (!abortController.signal.aborted) {
              const statusCode = error?.status || 500;
              console.error('Error fetching threads:', error?.data?.message);

              if (statusCode === 402) {
                setNeedPayment(true);
              }

              // Even if there was an error, try to show whatever threads we could get
              if (threads && threads.length > 0) {
                // Still show threads we were able to load
                setLoadingStatus('DONE');
              } else {
                setLoadingStatus('ERROR');
              }

              setQueriesLoaded((prev) => ({ ...prev, [queryKey]: true }));
            }
          }
          updateBadgeWithLabelCount(accounts.map((account) => account.uid));
        },
        {
          priority: OperationPriority.HIGH, // User-initiated search should be high priority
          type: 'fetch-threads',
          batch: false // Don't batch user searches
        }
      );
    },
    [
      globalSearchQueryRef,
      lastQuery,
      lastTimestampsRef,
      pageTokensRef,
      setThreads,
      updateThreadIds,
      setLoadingStatus,
      setThreadsMap,
      enqueueOperation,
      classifySearchQuery
    ]
  );

  const loadMore = useCallback(() => {
    if (loadingStatusRef.current === 'DONE' && hasMore && !isLoadingMore) {
      setIsLoadingMore(true);
      fetchThreadsHandler(true).finally(() => setIsLoadingMore(false));
    }
  }, [loadingStatusRef, hasMore, isLoadingMore]);

  const handlePostSync = useCallback(
    (accountId: string) => {
      enqueueOperation(
        async () => {
          // Check if this is a valid query that can use cache
          const currentQuery = globalSearchQueryRef.current;
          const { field, label } = parseQueryFieldLabel(currentQuery, true);

          const isValidQuery =
            (field === 'in' || field === 'is' || field === 'category') &&
            (validLabels.includes(label.toUpperCase() as ValidLabel) ||
              label.toLowerCase() === 'all');

          // Only reset cache and fetch if it's NOT a valid query
          const limitedAccountUids = getLimitedAccountUids();
          if (limitedAccountUids.includes(accountId) && cacheOffsetRef.current < 100) {
            // Reset cache for the current query
            const queryKey = globalSearchQueryRef.current || 'default';
            setLastTimestamps((prev) => ({ ...prev, [queryKey]: undefined }));
            setQueriesLoaded((prev) => ({ ...prev, [queryKey]: false }));
            // Use await to ensure this completes before continuing
            await fetchThreadsHandler(false);
          }
          setNeedPayment(false);
        },
        {
          priority: OperationPriority.MEDIUM,
          type: 'post-sync-handler',
          batch: false
        }
      );
    },
    [
      globalSearchQueryRef.current,
      activeSpaceRef.current,
      cacheOffsetRef.current,
      enqueueOperation,
      fetchThreadsHandler
    ]
  );

  const handleSyncError = useCallback(
    (status: number, accountId: string) => {
      enqueueOperation(
        async () => {
          if (status === 402) {
            setNeedPayment(true);
          }

          // If we get a 404 error from history sync, we need a full sync
          if (status === 404) {
            setNeedsFullSync((prev) => ({
              ...prev,
              [accountId]: true
            }));

            // Force a full sync for this account with more robust error handling
            syncThreads(
              accountId,
              () => handlePostSync(accountId),
              (errStatus) => {
                console.error(`Error during full sync: ${errStatus}`);
                setLoadingStatus('ERROR');
              }
            );
          } else {
            setLoadingStatus('ERROR');
          }
        },
        {
          priority: OperationPriority.MEDIUM,
          type: 'sync-error-handler',
          batch: false
        }
      );
    },
    [handlePostSync, enqueueOperation, globalSearchQuery]
  );

  const initializeHistorySync = useCallback(() => {
    enqueueOperation(
      async () => {
        const currentActiveSpace = activeSpaceRef.current;
        if (!currentActiveSpace?.id || !currentActiveSpace.activeAccountUids?.length) return;

        // Skip if history sync is already initialized for this space
        if (historySyncInitialized[currentActiveSpace.id]) return;

        // Mark history sync as initialized for this space
        setHistorySyncInitialized((prev) => ({
          ...prev,
          [currentActiveSpace.id]: true
        }));

        const limitedAccountUids = getLimitedAccountUids();
        limitedAccountUids.forEach(async (accountId) => {
          try {
            console.log(`Performing incremental history sync for account: ${accountId}`);
            // Use the optimized history sync for incremental updates
            syncThreadHistory(
              accountId,
              () => handlePostSync(accountId),
              (status) => handleSyncError(status, accountId)
            );
          } catch (error) {
            console.error(`Error checking sync status for account ${accountId}:`, error);
            // Fall back to full sync on error
          }
        });
      },
      {
        priority: OperationPriority.LOW,
        type: 'initialize-history-sync',
        batch: false
      }
    );
  }, [
    historySyncInitialized,
    handlePostSync,
    handleSyncError,
    enqueueOperation,
    activeSpace?.activeAccountUids
  ]);

  useEffect(() => {
    const messageUnsubscribe = messageSubscribe(updateFromMessageSubscribe);
    const historyUnsubscribe = historySubscribe(updateFromMessageSubscribe);

    return () => {
      messageUnsubscribe();
      historyUnsubscribe();
    };
  }, [activeSpace, updateFromMessageSubscribe]);

  // Check sync metadata when component mounts or active space changes
  useEffect(() => {
    enqueueOperation(
      async () => {
        const limitedAccountUids = getLimitedAccountUids();
        if (limitedAccountUids.length === 0) return;
        initializeHistorySync();
      },
      {
        priority: OperationPriority.HIGH,
        type: 'check-sync-status',
        batch: false
      }
    );
  }, [activeSpace?.id]);

  // Only initialize the query fetching without history sync when search query changes
  useEffect(() => {
    enqueueOperation(
      async () => {
        resetThreadsArray();
        await fetchThreadsHandler(false);

        const limitedAccountUids = getLimitedAccountUids();
        if (limitedAccountUids.length > 0) {
          limitedAccountUids.forEach((accountId) => {
            syncThreads(
              accountId,
              () => handlePostSync(accountId),
              (status) => handleSyncError(status, accountId)
            );
          });
        }
      },
      {
        priority: OperationPriority.HIGH,
        type: 'search-query-change-handler',
        batch: false
      }
    );

    return () => {
      // Abort pending API call on cleanup
      if (apiCallsRef.current) {
        apiCallsRef.current.abort();
        apiCallsRef.current = null;
      }
    };
  }, [globalSearchQuery, activeSpace?.id, activeSpace?.activeAccountUids]);

  return {
    resetThreadsArray,
    setThreadIds,
    threadIds,
    needPayment,
    fetchThreadsHandler,
    loadMore,
    hasMore,
    updateFromMessageSubscribe
  };
};

export default useThreadFetchHandler;
