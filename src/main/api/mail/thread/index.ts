import { apiClient } from '@/main/api/apiClient';
import { IMonoThread } from '@/main/models/thread/MonoThread';

export interface MailThreadListResponse {
  threads: IMonoThread[];
  nextPageToken?: string;
}

export type MailThreadGetResponse = IMonoThread;

const getThreads = async (
  uid: string,
  q: string,
  pageToken?: string,
  maxResults?: string,
  signal?: AbortSignal,
  idToken?: string
): Promise<MailThreadListResponse> => {
  const params = new URLSearchParams();
  if (pageToken) params.append('pageToken', pageToken);
  if (maxResults) params.append('maxResults', maxResults);
  params.append('q', q);

  return await apiClient.get<MailThreadListResponse>(`/mail/threads?${params.toString()}`, {
    signal,
    uid,
    idToken
  });
};

const getThread = async (
  uid: string,
  id: string,
  signal?: AbortSignal
): Promise<MailThreadGetResponse> => {
  return await apiClient.get<MailThreadGetResponse>(`/mail/threads/${id}`, {
    signal,
    uid
  });
};

const modifyThread = async (
  uid: string,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> => {
  const data = { addLabelIds, removeLabelIds };
  await apiClient.patch<void>(`/mail/threads/${id}/modify`, data, {
    uid,
    signal
  });
};

const batchModifyThreads = async (
  uid: string,
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<void> => {
  const data = { ids, addLabelIds, removeLabelIds };
  await apiClient.post<void>('/mail/messages/batch-modify', data, {
    uid,
    signal
  });
};

export default {
  getThreads,
  getThread,
  modifyThread,
  batchModifyThreads
};
