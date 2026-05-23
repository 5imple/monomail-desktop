import { apiClient } from '@/main/api/apiClient';
import mailApi from '@/main/api/mail/mailApi';
import { GmailLabel } from '@/main/api/gmail/types';
import { LabelColor } from '@/renderer/app/store/label/labelTemplate';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';
import { atom, useAtom } from 'jotai';
import { useCallback } from 'react';

// Updated type to store labels by account ID
export type LabelsMapByAccount = Record<string, Record<string, GmailLabel>>;

// Cache key for labels
const LABELS_CACHE_KEY = 'cache:label:labels';

// Utility function to get cached labels from IndexedDB
export const getCachedLabels = async (): Promise<LabelsMapByAccount> => {
  try {
    const cachedLabels = await monoLocalStorageDb.getItem<LabelsMapByAccount>(LABELS_CACHE_KEY);
    return cachedLabels || {};
  } catch (error) {
    console.warn('Failed to get cached labels:', error);
    return {};
  }
};

// Cache labels to IndexedDB
const cacheLabels = async (labels: LabelsMapByAccount): Promise<void> => {
  try {
    await monoLocalStorageDb.setItem(LABELS_CACHE_KEY, labels);
  } catch (error) {
    console.warn('Failed to cache labels:', error);
  }
};

// Clear labels cache
export const clearLabelsCache = async (): Promise<void> => {
  try {
    await monoLocalStorageDb.removeItem(LABELS_CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear labels cache:', error);
  }
};

// Label color type
// Atoms for managing labels
export const labelsMapAtom = atom<LabelsMapByAccount>({});

export function useLabelAtom() {
  const [labelsMapByAccount, setLabelsMapByAccount] = useAtom(labelsMapAtom);

  // Load cached labels when offline or for faster loading
  const loadCachedLabels = useCallback(async (): Promise<boolean> => {
    try {
      const cachedLabels = await getCachedLabels();

      if (Object.keys(cachedLabels).length > 0) {
        setLabelsMapByAccount(cachedLabels);
        console.log('Loaded cached labels for', Object.keys(cachedLabels).length, 'accounts');
        return true;
      } else {
        console.log('No cached labels found');
      }
    } catch (error) {
      console.warn('Failed to load cached labels:', error);
    }
    return false;
  }, [setLabelsMapByAccount]);

  // Create a new label and update the map
  const createLabel = useCallback(
    async (name: string, accountId: string, color?: LabelColor): Promise<GmailLabel | null> => {
      try {
        apiClient.setApiActiveUid(accountId);

        // Create label options with color if provided
        const labelOptions: {
          name: string;
          backgroundColor?: string;
          textColor?: string;
        } = {
          name
        };

        // Add color if specified
        if (color) {
          labelOptions.backgroundColor = color.backgroundColor;
          labelOptions.textColor = color.textColor;
        }

        const response = await mailApi.createLabel(
          accountId,
          labelOptions.name,
          labelOptions.backgroundColor,
          labelOptions.textColor
        );

        const newLabel = {
          id: response.id,
          name: response.name,
          color: {
            backgroundColor: labelOptions.backgroundColor,
            textColor: labelOptions.textColor
          }
        } as GmailLabel;

        const updatedLabelsMap = {
          ...labelsMapByAccount,
          [accountId]: {
            ...(labelsMapByAccount[accountId] || {}),
            [newLabel.id]: { ...newLabel }
          }
        };

        setLabelsMapByAccount(updatedLabelsMap);

        // Cache the updated labels
        await cacheLabels(updatedLabelsMap);

        return newLabel;
      } catch (error) {
        console.error(`Error creating label "${name}":`, error);
        throw error as Error;
      }
    },
    [setLabelsMapByAccount, labelsMapByAccount]
  );

  // Load labels from API and populate labelsMapByAccount.
  // uids: the list of account UIDs to fetch labels for (pass accounts.map(a => a.uid)).
  const loadLabels = useCallback(async (uids: string[]): Promise<void> => {
    try {
      // First, try to load from cache for immediate feedback
      await loadCachedLabels();

      // Then fetch fresh data from server
      console.log('Fetching fresh labels from server...');

      // Fetch labels for each account and merge into a single map
      const responses = await Promise.all(uids.map((uid) => mailApi.getLabels(uid)));
      const merged = responses.reduce<{ labels: Record<string, any[]> }>(
        (acc, r) => ({ labels: { ...acc.labels, ...r.labels } }),
        { labels: {} }
      );
      const response = merged;

      // The response is now a map of accountId to labels array
      const newLabelsMap: LabelsMapByAccount = {};

      // Process each account's labels
      for (const [accountId, labelsArray] of Object.entries(response.labels)) {
        // Filter out Superhuman labels
        const filteredLabels = labelsArray
          .filter((label) => !label.name.startsWith('[Superhuman]'))
          .filter((label) => label.name !== 'Mono');

        // Convert array to a map for this account
        const labelsForAccount = filteredLabels.reduce<Record<string, GmailLabel>>((acc, label) => {
          acc[label.id] = label;
          return acc;
        }, {});

        // Add to the overall map
        newLabelsMap[accountId] = labelsForAccount;
      }

      setLabelsMapByAccount(newLabelsMap);

      // Cache the fresh data
      await cacheLabels(newLabelsMap);
      console.log('Updated labels cache with fresh data');
    } catch (error) {
      console.error('Error loading labels:', error);

      // If we failed to fetch from server, ensure cached data is loaded
      const hasCache = await loadCachedLabels();
      if (!hasCache) {
        // If no cache either, we're in a bad state - this will be handled by the UI
        console.warn('No cached labels available and server fetch failed');
      }
    }
  }, [setLabelsMapByAccount, loadCachedLabels]); // uids is an arg, not a dep

  // Update an existing label
  const updateLabel = useCallback(
    async (labelId: string, name: string, accountId: string, color?: LabelColor): Promise<void> => {
      try {
        apiClient.setApiActiveUid(accountId);

        // Create update options with color if provided
        const updateOptions: {
          name: string;
          color?: { backgroundColor: string; textColor: string };
        } = {
          name
        };

        // Add color if specified
        if (color) {
          updateOptions.color = {
            backgroundColor: color.backgroundColor,
            textColor: color.textColor
          };
        }

        const response = await mailApi.updateLabel(
          accountId,
          labelId,
          updateOptions.name,
          updateOptions.color?.backgroundColor,
          updateOptions.color?.textColor
        );
        if (response) {
          const updatedLabelsMap = {
            ...labelsMapByAccount,
            [accountId]: {
              ...(labelsMapByAccount[accountId] || {}),
              [labelId]: response as GmailLabel
            }
          };

          setLabelsMapByAccount(updatedLabelsMap);

          // Cache the updated labels
          await cacheLabels(updatedLabelsMap);
        }
      } catch (error) {
        console.error('Error updating label:', error);
        throw error as Error;
      }
    },
    [setLabelsMapByAccount, labelsMapByAccount]
  );

  // Remove a label
  const removeLabel = useCallback(
    async (labelId: string, accountId: string): Promise<void> => {
      try {
        await mailApi.deleteLabel(accountId, labelId);

        const updatedLabelsMap = { ...labelsMapByAccount };
        if (updatedLabelsMap[accountId]) {
          const accountLabels = { ...updatedLabelsMap[accountId] };
          delete accountLabels[labelId];
          updatedLabelsMap[accountId] = accountLabels;
        }

        setLabelsMapByAccount(updatedLabelsMap);

        // Cache the updated labels
        await cacheLabels(updatedLabelsMap);
      } catch (error) {
        console.error('Error deleting label:', error);
        throw error as Error;
      }
    },
    [setLabelsMapByAccount, labelsMapByAccount]
  );

  // Get all labels from all accounts as a flat array
  const getAllLabels = useCallback((): GmailLabel[] => {
    return Object.values(labelsMapByAccount).flatMap((accountLabels) =>
      Object.values(accountLabels)
    );
  }, [labelsMapByAccount]);

  // Get all labels for a specific account
  const getLabelsForAccount = useCallback(
    (accountId: string): GmailLabel[] => {
      const accountLabels = labelsMapByAccount[accountId] || {};

      return Object.values(accountLabels);
    },
    [labelsMapByAccount]
  );

  // Get all label IDs across all accounts that match a given label name
  const getLabelIdsByName = useCallback(
    (labelName: string): { accountId: string; labelId: string }[] => {
      const result: { accountId: string; labelId: string }[] = [];
      // Iterate through all accounts
      Object.entries(labelsMapByAccount).forEach(([accountId, labelsMap]) => {
        // Find all labels in this account that match the name
        Object.entries(labelsMap).forEach(([labelId, label]) => {
          if (label.name.toLowerCase() === labelName.toLowerCase()) {
            result.push({
              accountId,
              labelId
            });
          }
        });
      });

      return result;
    },
    [setLabelsMapByAccount, labelsMapByAccount]
  );
  const defaultLabels = [
    'INBOX',
    'SENT',
    'DRAFT',
    'TRASH',
    'SPAM',
    'CHAT',
    'IMPORTANT',
    'CATEGORY_FORUMS',
    'CATEGORY_UPDATES',
    'CATEGORY_PERSONAL',
    'CATEGORY_PROMOTIONS',
    'CATEGORY_SOCIAL',
    'YELLOW_STAR',
    'STARRED',
    'UNREAD'
  ];

  // Get unique label names across all accounts (excluding default system labels)
  const getUniqueCustomLabelNames = useCallback((): string[] => {
    // Create a Set to store unique label names
    const uniqueLabelNames = new Set<string>();

    // Iterate through all accounts and labels
    Object.values(labelsMapByAccount).forEach((labelsMap) => {
      Object.values(labelsMap).forEach((label) => {
        // Skip system/default labels
        if (!defaultLabels.includes(label.name)) {
          uniqueLabelNames.add(label.name);
        }
      });
    });

    // Convert Set back to array and sort alphabetically
    return Array.from(uniqueLabelNames).sort();
  }, [labelsMapByAccount]);

  return {
    labelsMapByAccount,
    setLabelsMapByAccount,
    loadLabels,
    loadCachedLabels,
    createLabel,
    updateLabel,
    removeLabel,
    defaultLabels,
    getAllLabels,
    getLabelsForAccount,
    getLabelIdsByName,
    getUniqueCustomLabelNames
  };
}
