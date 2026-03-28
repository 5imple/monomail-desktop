import { apiClient } from '@/main/api/apiClient';
import {
  MailSearchQueryRequest,
  MailSearchQueryResponse,
  MailSearchWithThreadsRequest,
  MailSearchWithThreadsResponse
} from '@/main/api/mail/types';

const generateSearchQueries = async (
  uid: string,
  request: MailSearchQueryRequest,
  signal?: AbortSignal
) => {
  return await apiClient.post<MailSearchQueryResponse>('/mail/ai-search-query', request, {
    signal,
    uid
  });
};

const aiSearchThreads = async (
  uid: string,
  request: MailSearchWithThreadsRequest,
  signal?: AbortSignal
) => {
  return await apiClient.post<MailSearchWithThreadsResponse>('/mail/ai-search', request, {
    signal,
    uid
  });
};

export default { generateSearchQueries, aiSearchThreads };
