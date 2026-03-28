import { apiClient } from '@/main/api/apiClient';

import {
  GmailThreadListResponse,
  GmailThreadGetResponse,
  GmailThreadUpdateResponse
} from '@/main/api/gmail/types';

/**
 * Get threads from Gmail.
 * @param {string} q - The query string.
 * @param {string} [pageToken] - The page token for pagination.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailThreadListResponse>} The list of threads.
 */
const getThreads = (
  uid: string,
  q: string,
  pageToken?: string,
  maxResults?: string,
  signal?: AbortSignal,
  idToken?: string
) => {
  const params = new URLSearchParams();
  if (pageToken) params.append('pageToken', pageToken);
  if (maxResults) params.append('maxResults', maxResults);
  params.append('q', q);

  return apiClient.get<GmailThreadListResponse>(`/gmail/threads?${params.toString()}`, {
    signal,
    uid,
    idToken
  });
};

/**
 * Get a specific thread by ID.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailThreadGetResponse>} The thread details.
 */
const getThread = (uid: string, id: string, signal?: AbortSignal) => {
  return apiClient.get<GmailThreadGetResponse>(`/gmail/threads/${id}`, {
    signal,
    uid
  });
};

/**
 * Trash a specific thread by ID.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>}
 */
const trashThread = (uid: string, id: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/gmail/threads/${id}/trash`, { signal, uid });
};

/**
 * Delete a specific thread by ID.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>}
 */
const deleteThread = (uid: string, id: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/gmail/threads/${id}`, { signal, uid });
};

/**
 * Modify a thread by adding or removing labels.
 * @param {string[]} addLabelIds - The IDs of labels to add.
 * @param {string[]} removeLabelIds - The IDs of labels to remove.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailThreadUpdateResponse>} The response from the API.
 */
const modifyThread = (
  uid: string,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
) => {
  const data = { addLabelIds, removeLabelIds };

  return apiClient.patch<GmailThreadUpdateResponse>(`/gmail/threads/${id}/modify`, data, {
    uid,
    signal
  });
};

/**
 * Batch modify Gmail messages by adding or removing labels.
 * @param {string[]} ids - The IDs of messages to modify.
 * @param {string[]} addLabelIds - The IDs of labels to add.
 * @param {string[]} removeLabelIds - The IDs of labels to remove.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Resolves when the operation is complete.
 */
const batchModifyThreads = async (
  uid: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> => {
  const data = { ids, addLabelIds, removeLabelIds };

  return await apiClient.post<void>('/gmail/messages/batch-modify', data, {
    uid,
    signal
  });
};

/**
 * Get the total count of Gmail threads with a specific label.
 * @param {string} label - The label name to filter threads by.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{ totalCount: number }>} The total count of threads with the specified label.
 */
const getThreadsCount = (uid: string, label: string, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  params.append('label', label);

  return apiClient.get<{ totalCount: number }>(`/gmail/threads/count?${params.toString()}`, {
    uid,
    signal
  });
};

export default {
  getThreads,
  getThread,
  trashThread,
  deleteThread,
  modifyThread,
  batchModifyThreads,
  getThreadsCount
};
