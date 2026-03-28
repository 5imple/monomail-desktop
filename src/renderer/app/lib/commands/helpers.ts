import { useCallback } from 'react';

export const useCommandHelpers = (accounts: any[], threadsMap: any) => {
  // Helper function to get account email from accountId
  const getAccountEmailById = useCallback(
    (accountId?: string) => {
      if (!accountId || !accounts || accounts.length === 0) {
        return accounts && accounts.length > 0 ? accounts[0].email : '';
      }

      const account = accounts.find((acc) => acc.uid === accountId);
      return account ? account.email : accounts[0]?.email || '';
    },
    [accounts]
  );

  // Group threads by account ID
  const groupThreadsByAccount = useCallback(
    (threadIds: string[]) => {
      const result: Record<string, string[]> = {};

      threadIds.forEach((threadId) => {
        const thread = threadsMap[threadId];
        if (thread) {
          const accountId = thread.accountId;
          if (!result[accountId]) {
            result[accountId] = [];
          }
          result[accountId].push(threadId);
        }
      });

      return result;
    },
    [threadsMap]
  );

  return {
    getAccountEmailById,
    groupThreadsByAccount
  };
};
