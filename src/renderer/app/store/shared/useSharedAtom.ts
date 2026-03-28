// src/store/share/useSharedAtom.ts

import { apiClient } from '@/main/api/apiClient';
import shareApi from '@/main/api/share/shareApi';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import { sharedByAccountAtom, sharedLoadingAtom, OwnerShare } from './atoms';

export function useSharedAtom() {
  const [sharedByAccount, setSharedByAccount] = useAtom(sharedByAccountAtom);
  const [sharedLoading, setSharedLoading] = useAtom(sharedLoadingAtom);

  // Load owner shares from API for a specific account
  const loadShared = useCallback(
    async (accountId: string): Promise<OwnerShare[]> => {
      if (!accountId) {
        console.warn('No account ID provided for loading owner shares');
        return [];
      }

      try {
        // Set loading state
        setSharedLoading((prev) => ({
          ...prev,
          [accountId]: true
        }));

        // Set API active uid
        apiClient.setApiActiveUid(accountId);
        const shared = await shareApi.getOwnerShares();

        // Update atom with the fetched shares
        setSharedByAccount((prev) => ({
          ...prev,
          [accountId]: shared
        }));

        return shared;
      } catch (error) {
        console.error('Failed to load owner shares:', error);

        // Set empty array on error
        setSharedByAccount((prev) => ({
          ...prev,
          [accountId]: []
        }));

        return [];
      } finally {
        // Clear loading state
        setSharedLoading((prev) => ({
          ...prev,
          [accountId]: false
        }));
      }
    },
    [setSharedByAccount, setSharedLoading]
  );

  // Load shared items for all accounts using the new mono/share endpoint
  const loadSharedForAllAccounts = useCallback(async (): Promise<Record<string, OwnerShare[]>> => {
    try {
      // Set global loading state
      setSharedLoading((prev) => ({
        ...prev,
        __all__: true
      }));

      // Call the new mono/share endpoint
      const monoSharedData = await shareApi.getMonoShares();

      // Update atom with all the fetched shares
      setSharedByAccount((prev) => ({
        ...prev,
        ...monoSharedData
      }));

      // Set loading state for each account to false
      const accountLoadingStates: Record<string, boolean> = {};
      Object.keys(monoSharedData).forEach((accountId) => {
        accountLoadingStates[accountId] = false;
      });

      setSharedLoading((prev) => ({
        ...prev,
        ...accountLoadingStates
      }));

      return monoSharedData;
    } catch (error) {
      console.error('Failed to load shared items for all accounts:', error);

      // Reset loading states on error
      setSharedLoading((prev) => {
        const newState = { ...prev };
        delete newState.__all__;
        return newState;
      });

      return {};
    } finally {
      // Clear global loading state
      setSharedLoading((prev) => {
        const newState = { ...prev };
        delete newState.__all__;
        return newState;
      });
    }
  }, [setSharedByAccount, setSharedLoading]);

  // Get owner shares for a specific account
  const getSharedForAccount = useCallback(
    (accountId: string): OwnerShare[] => {
      return sharedByAccount[accountId] || [];
    },
    [sharedByAccount]
  );

  // Check if a specific item is shared
  const isItemShared = useCallback(
    (
      accountId: string,
      itemId: string,
      type: 'thread' | 'message' | 'draft'
    ): OwnerShare | null => {
      const shares = getSharedForAccount(accountId);
      const typePrefix = type === 'thread' ? 't_' : 'm_';
      const expectedDataId = `${typePrefix}${itemId}`;

      return (
        shares.find(
          (share) => share.dataId === expectedDataId && share.sharedDataType === type.toUpperCase()
        ) || null
      );
    },
    [getSharedForAccount]
  );

  const isItemPublished = useCallback(
    (accountId: string, itemId: string, type: 'thread' | 'message' | 'draft'): boolean => {
      const shares = getSharedForAccount(accountId);
      const typePrefix = type === 'thread' ? 't_' : 'm_';
      const expectedDataId = `${typePrefix}${itemId}`;

      return (
        shares.find(
          (share) => share.dataId === expectedDataId && share.sharedDataType === type.toUpperCase()
        )?.published || false
      );
    },
    [getSharedForAccount]
  );

  // Get loading state for a specific account
  const isLoadingForAccount = useCallback(
    (accountId: string): boolean => {
      return sharedLoading[accountId] || false;
    },
    [sharedLoading]
  );

  // Check if loading all accounts
  const isLoadingAllAccounts = useCallback((): boolean => {
    return sharedLoading.__all__ || false;
  }, [sharedLoading]);

  // Add or update a share in the atom (for when creating/updating shares)
  const addOrUpdateShare = useCallback(
    (accountId: string, share: OwnerShare) => {
      setSharedByAccount((prev) => {
        const currentShares = prev[accountId] || [];
        const existingIndex = currentShares.findIndex((s) => s.id === share.id);

        let updatedShares: OwnerShare[];
        if (existingIndex >= 0) {
          // Update existing share
          updatedShares = [...currentShares];
          updatedShares[existingIndex] = share;
        } else {
          // Add new share
          updatedShares = [...currentShares, share];
        }

        return {
          ...prev,
          [accountId]: updatedShares
        };
      });
    },
    [setSharedByAccount]
  );

  // Remove a share from the atom (for when deleting shares)
  const removeShare = useCallback(
    (accountId: string, shareId: string) => {
      setSharedByAccount((prev) => {
        const currentShares = prev[accountId] || [];
        const updatedShares = currentShares.filter((share) => share.id !== shareId);

        return {
          ...prev,
          [accountId]: updatedShares
        };
      });
    },
    [setSharedByAccount]
  );

  // Reset shares for a specific account
  const resetSharesForAccount = useCallback(
    (accountId: string) => {
      setSharedByAccount((prev) => {
        const newState = { ...prev };
        delete newState[accountId];
        return newState;
      });

      setSharedLoading((prev) => {
        const newState = { ...prev };
        delete newState[accountId];
        return newState;
      });
    },
    [setSharedByAccount, setSharedLoading]
  );

  // Reset all shares
  const resetAllShares = useCallback(() => {
    setSharedByAccount({});
    setSharedLoading({});
  }, [setSharedByAccount, setSharedLoading]);

  // Get all shares across all accounts
  const getAllShares = useCallback((): OwnerShare[] => {
    const allShares: OwnerShare[] = [];

    Object.values(sharedByAccount).forEach((accountShares) => {
      allShares.push(...accountShares);
    });

    return allShares;
  }, [sharedByAccount]);

  return {
    sharedByAccount,
    sharedLoading,
    loadShared,
    loadSharedForAllAccounts,
    getSharedForAccount,
    isItemShared,
    isLoadingForAccount,
    isLoadingAllAccounts,
    addOrUpdateShare,
    removeShare,
    isItemPublished,
    resetSharesForAccount,
    resetAllShares,
    getAllShares
  };
}
