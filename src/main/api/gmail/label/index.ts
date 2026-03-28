import { apiClient } from '@/main/api/apiClient';

import {
  GmailLabel,
  GmailLabelCreateResponse,
  GmailLabelListResponse,
  GmailLabelUpdateResponse
} from '@/main/api/gmail/types';

/**
 * Get a list of Gmail labels.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailLabelListResponse>} The list of Gmail labels.
 */
const getLabels = (signal?: AbortSignal) => {
  return apiClient.get<GmailLabelListResponse>('/gmail/labels', { signal });
};

/**
 * Create a new Gmail label.
 * @param {string} name - The name of the new label.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailLabelCreateResponse>} The created label response.
 */
const createLabel = (
  uid: string,
  name: string,
  backgroundColor?: string,
  textColor?: string,
  signal?: AbortSignal
) => {
  return apiClient.post<GmailLabelCreateResponse>(
    '/gmail/labels',
    { name, backgroundColor, textColor },
    { signal, uid }
  );
};

/**
 * Get a specific Gmail label by ID.
 * @param {string} labelId - The ID of the label.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailLabel>} The label response.
 */
const getLabelById = (uid: string, labelId: string, signal?: AbortSignal) => {
  return apiClient.get<GmailLabel>(`/gmail/labels/${labelId}`, { signal, uid });
};

/**
 * Update an existing Gmail label.
 * @param {string} labelId - The ID of the label.
 * @param {string} name - The new name for the label.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailLabelUpdateResponse>} The updated label response.
 */
const updateLabel = (
  uid: string,
  labelId: string,
  name: string,
  backgroundColor?: string,
  textColor?: string,
  signal?: AbortSignal
) => {
  return apiClient.patch<GmailLabelUpdateResponse>(
    `/gmail/labels/${labelId}`,
    { name, textColor, backgroundColor },
    { signal, uid }
  );
};

/**
 * Delete a specific Gmail label by ID.
 * @param {string} labelId - The ID of the label.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The deleted label response.
 */
const deleteLabel = (uid: string, labelId: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/gmail/labels/${labelId}`, { signal, uid });
};

export default { getLabels, createLabel, getLabelById, updateLabel, deleteLabel };
