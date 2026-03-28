import {
  AIFilterRequest,
  AIFilterResponse,
  AIFilterTestRequest,
  AIFilterTestResponse
} from '@/main/api/ai/types';
import { apiClient } from '@/main/api/apiClient';

/**
 * Create a new AI filter.
 * @param {AIFilterRequest} filter - The AI filter to create.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Empty response on success.
 */
const createAIFilter = (uid: string, filter: AIFilterRequest, signal?: AbortSignal) => {
  return apiClient.post<void>(`/mono/filters`, filter, {
    uid,
    signal
  });
};

/**
 * Get all AI filters for the authenticated user.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<Array<AIFilterResponse>>} List of AI filters.
 */
const getAIFilters = (uid: string, signal?: AbortSignal) => {
  return apiClient.get<Array<AIFilterResponse>>(`/mono/filters`, {
    signal,
    uid
  });
};

/**
 * Update an existing AI filter.
 * @param {AIFilterRequest} filter - The AI filter to update.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Empty response on success.
 */
const updateAIFilter = (uid: string, filter: AIFilterRequest, signal?: AbortSignal) => {
  return apiClient.put<void>(`/mono/filters`, filter, {
    signal,
    uid
  });
};

/**
 * Delete an AI filter by ID.
 * @param {string} filterId - The ID of the filter to delete.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Empty response on success.
 */
const deleteAIFilter = (uid: string, filterId: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/mono/filters/${filterId}`, {
    signal,
    uid
  });
};

/**
 * Get all AI filters across all accounts.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<Record<string, Array<AIFilterResponse>>>} Map of user IDs to their AI filters.
 */
const getAllAIFilters = (signal?: AbortSignal) => {
  return apiClient.get<Record<string, Array<AIFilterResponse>>>(`/mono/filters/all`, {
    signal
  });
};

/**
 * Test an AI filter with sample email data.
 * @param {string} uid - The user ID.
 * @param {AIFilterTestRequest} request - The filter test request with prompt and email data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<AIFilterTestResponse>} The test results showing which emails would be filtered.
 */
const testAIFilter = (uid: string, request: AIFilterTestRequest, signal?: AbortSignal) => {
  return apiClient.post<AIFilterTestResponse>('/ai/filter-test', request, {
    uid,
    signal
  });
};

export default {
  createAIFilter,
  getAIFilters,
  updateAIFilter,
  deleteAIFilter,
  getAllAIFilters,
  testAIFilter
};
