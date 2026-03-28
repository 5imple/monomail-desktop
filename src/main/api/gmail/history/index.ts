import { apiClient } from '@/main/api/apiClient';
import { GmailHistoryListResponse } from '@/main/api/gmail/types';

/**
 * Get Gmail history list.
 * @param {string} historyId - The ID of the history to start from.
 * @param {string} [pageToken] - The page token for pagination.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailHistoryListResponse>} The list of history items.
 */
const getHistoryList = (
  uid: string,
  historyId: string,
  pageToken?: string,
  signal?: AbortSignal
): Promise<GmailHistoryListResponse> => {
  const params = new URLSearchParams();
  params.append('historyId', historyId);

  if (pageToken) {
    params.append('pageToken', pageToken);
  }

  return apiClient.get<GmailHistoryListResponse>(`/gmail/histories?${params.toString()}`, {
    uid,
    signal
  });
};

export default { getHistoryList };
