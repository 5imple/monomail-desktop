import { apiClient } from '@/main/api/apiClient';

import {
  GmailDraft,
  GmailDraftCreateResponse,
  GmailDraftListResponse,
  GmailDraftUpdateResponse
} from '@/main/api/gmail/types';
import { IMonoDraft } from '@/main/models/draft/MonoDraft';

const getDrafts = (signal?: AbortSignal) => {
  return apiClient.get<GmailDraftListResponse>(`/gmail/drafts`, {});
};

/**
 * Create a new draft.
 * @param {IMonoDraft} draftData - The data for creating a new draft..
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailDraftCreateResponse>} The created draft response.
 */
const createDraft = (uid: string, draftData: IMonoDraft, signal?: AbortSignal) => {
  const formData = new FormData();
  formData.append('to', draftData.to.join(','));
  draftData.cc.length > 0 && formData.append('cc', draftData.cc.join(','));
  draftData.bcc.length > 0 && formData.append('bcc', draftData.bcc.join(','));
  formData.append('subject', draftData.subject);
  formData.append('body', draftData.body);
  draftData.messageId && formData.append('messageId', draftData.messageId);
  draftData.threadId && formData.append('threadId', draftData.threadId);

  return apiClient.post<GmailDraftCreateResponse>('/gmail/drafts', formData, {
    signal,
    uid
  });
};

/**
 * Get a specific draft by ID.
 * @param {string} draftId - The ID of the draft.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailDraft>} The draft response.
 */
const getDraftById = (uid: string, draftId: string, signal?: AbortSignal) => {
  return apiClient.get<GmailDraft>(`/gmail/drafts/${draftId}`, {
    signal
  });
};

/**
 * Update an existing draft.
 * @param {IMonoDraft} draftData - The data for updating the draft..
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailDraftUpdateResponse>} The updated draft response.
 */
const updateDraft = (uid: string, draftData: IMonoDraft, signal?: AbortSignal) => {
  const formData = new FormData();
  formData.append('to', draftData.to.join(','));
  draftData.cc.length > 0 && formData.append('cc', draftData.cc.join(','));
  draftData.bcc.length > 0 && formData.append('bcc', draftData.bcc.join(','));
  formData.append('subject', draftData.subject);
  formData.append('body', draftData.body);
  draftData.messageId && formData.append('messageId', draftData.messageId);
  draftData.threadId && formData.append('threadId', draftData.threadId);

  return apiClient.patch<GmailDraftUpdateResponse>(`/gmail/drafts/${draftData.id}`, draftData, {
    signal,
    uid
  });
};

/**
 * Delete a specific draft by ID.
 * @param {string} draftId - The ID of the draft..
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The deleted draft response.
 */
const deleteDraft = (uid: string, draftId: string, signal?: AbortSignal) => {
  return apiClient.patch<void>(`/gmail/drafts/${draftId}/delete`, {
    signal,
    uid
  });
};

export default {
  getDrafts,
  createDraft,
  getDraftById,
  updateDraft,
  deleteDraft
};
