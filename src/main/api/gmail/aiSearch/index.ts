import { apiClient } from '@/main/api/apiClient';
import {
  GmailSearchQueryRequest,
  GmailSearchQueryResponse,
  GmailSearchWithThreadsRequest,
  GmailSearchWithThreadsResponse
} from '@/main/api/gmail/types';

/**
 * Generate search queries from natural language using AI.
 * @param {string} uid - The user ID.
 * @param {GmailSearchQueryRequest} request - The search request with natural language prompt.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailSearchQueryResponse>} The generated search queries.
 */
const generateSearchQueries = (
  uid: string,
  request: GmailSearchQueryRequest,
  signal?: AbortSignal
) => {
  return apiClient.post<GmailSearchQueryResponse>('/gmail/ai-search-query', request, {
    signal,
    uid
  });
};

/**
 * Generate search queries and fetch threads using AI.
 * @param {string} uid - The user ID.
 * @param {GmailSearchWithThreadsRequest} request - The search request with natural language prompt and pagination options.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailSearchWithThreadsResponse>} The generated queries and fetched threads.
 */
const aiSearchThreads = (
  uid: string,
  request: GmailSearchWithThreadsRequest,
  signal?: AbortSignal
) => {
  return apiClient.post<GmailSearchWithThreadsResponse>('/gmail/ai-search', request, {
    signal,
    uid
  });
};

export default {
  generateSearchQueries,
  aiSearchThreads
};
