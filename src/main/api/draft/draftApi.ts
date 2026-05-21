/* eslint-disable @typescript-eslint/no-unused-expressions */
import { apiClient } from '@/main/api/apiClient';
import {
  DraftAttachmentDownloadResponse,
  DraftUploadInlineImageResponse,
  MonoDraftGetResponse,
  MonoDraftUpdateRequest,
  SendDraftResponse,
  UploadDraftAttachmentResponse
} from '@/main/api/draft/types';

/**
 * Get a specific draft by ID.
 * @param {string} draftId - The ID of the draft.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoDraftGetResponse>} The draft response.
 */
const getDraftById = (draftId: string, signal?: AbortSignal) => {
  return apiClient.get<MonoDraftGetResponse>(`/mail/drafts/${draftId}`, {
    signal
  });
};

/**
 * Get a specific draft by ID.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoDraftGetResponse>} The draft response.
 */
const getDrafts = (signal?: AbortSignal) => {
  return apiClient.get<MonoDraftGetResponse>(`/mail/drafts`, {
    signal
  });
};
/**
 * Update an existing draft.
 * @param {string} draftId - The ID of the draft.
 * @param {MonoDraftUpdateRequest} draftData - The data for updating the draft.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The updated draft response.
 */
const updateDraft = (
  uid: string,
  draftId: string,
  draftData: MonoDraftUpdateRequest,
  signal?: AbortSignal
) => {
  const formData = new FormData();
  formData.append('to', draftData.to.join(','));
  draftData.cc.length > 0 && formData.append('cc', draftData.cc.join(','));
  draftData.bcc.length > 0 && formData.append('bcc', draftData.bcc.join(','));
  formData.append('subject', draftData.subject);
  formData.append('body', draftData.body);
  draftData.messageId && formData.append('messageId', draftData.messageId);
  draftData.threadId && formData.append('threadId', draftData.threadId);
  draftData.from && formData.append('from', draftData.from);
  draftData.signatureId && formData.append('signatureId', draftData.signatureId);

  if (Object.keys(draftData.attachments).length > 0) {
    const attachmentIds = Object.keys(draftData.attachments).join(',');
    formData.append('attachments', attachmentIds);
  }

  return apiClient.put<void>(`/mail/drafts/${draftId}`, formData, { signal, uid });
};

/**
 * Delete a specific draft by ID.
 * @param {string} draftId - The ID of the draft..
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The deleted draft response.
 */
const deleteDraft = (uid: string, draftId: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/mail/drafts/${draftId}`, { uid, signal });
};

/**
 * Send an existing draft.
 * @param {string} draftId - The ID of the draft.
 * @param {boolean} [withTracking] - Whether to include tracking parameter.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<SendDraftResponse>} The updated draft response.
 */
const sendDraft = (
  uid: string,
  draftId: string,
  withTracking: boolean = false,
  signal?: AbortSignal
) => {
  const url = withTracking ? `/mail/drafts/${draftId}/send?t=true` : `/mail/drafts/${draftId}/send`;
  return apiClient.post<SendDraftResponse>(url, {}, { uid, signal });
};

/**
 * Send an existing draft.
 * @param {string} draftId - The ID of the draft.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<SendDraftResponse>} The updated draft response.
 */
const sendDraftLazy = (uid: string, draftId: string, signal?: AbortSignal) => {
  return apiClient.post<SendDraftResponse>(`/mail/drafts/${draftId}/send/lazy`, {}, { uid, signal });
};

/**
 * Cancel a draft send.
 * @param {string} taskId - The ID of the task.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The updated draft response.
 */
const cancelSend = (uid: string, taskId: string, signal?: AbortSignal) => {
  const formData = new FormData();
  formData.append('taskId', taskId);
  return apiClient.post<void>(`/mail/drafts/send/cancel`, formData, {
    uid,
    signal
  });
};

/**
 * Upload a single attachment for a draft.
 * @param {string} attachmentId - The unique ID of the attachment.
 * @param {string} draftId - The ID of the draft.
 * @param {File} file - The file to be uploaded.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {UploadDraftAttachmentResponse} The updated draft response.
 */
const uploadAttachment = (
  uid: string,
  attachmentId: string,
  draftId: string,
  file: File,
  signal?: AbortSignal
) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uuid', attachmentId);
  formData.append('draftId', draftId);

  return apiClient.post<UploadDraftAttachmentResponse>(`/mail/drafts/upload/attachment`, formData, {
    uid,
    signal
  });
};

/**
 * (Deprecated) Upload attachments for a draft.
 * @param {attachmentId} attachmentId - A attachment IDs of a files.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {void} The updated draft response.
 */
const deleteAttachment = (attachmentId: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    uuid: attachmentId
  });

  return apiClient.delete<void>(`/mail/drafts/delete/attachment?${params.toString()}`, { signal });
};

/**
 * Get an attachment from a draft.
 * @param {string} attachmentId - The ID of the attachment.
 * @param {string} id - The ID of the attachment.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<DraftAttachmentDownloadResponse>} The attachment details.
 */
const getAttachmentDownload = (uid: string, attachmentId: string, signal?: AbortSignal) => {
  return apiClient.get<Blob>(`/mail/drafts/attachments/${attachmentId}/download`, {
    uid,
    responseType: 'blob',
    signal
  });
};

/**
 * Upload an inline image to Firebase Storage and link it to a draft.
 * @param {File} file - The image file to be uploaded.
 * @param {string} uuid - The upload file UUID.
 * @param {string} draftId - The related draft UUID.
 * @returns {Promise<DraftUploadInlineImageResponse>}
 */
const uploadInlineImage = (uid: string, file: File, uuid: string, draftId: string) => {
  const params = new URLSearchParams();
  params.append('uuid', uuid);
  params.append('draftId', draftId);

  const formData = new FormData();
  formData.append('file', file);

  return apiClient.post<DraftUploadInlineImageResponse>(
    `/mail/drafts/upload/inline-image?${params.toString()}`,
    formData,
    {
      uid,
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  );
};

export default {
  updateDraft,
  getDrafts,
  getDraftById,
  deleteDraft,
  sendDraft,
  sendDraftLazy,
  cancelSend,
  deleteAttachment,
  uploadAttachment,
  getAttachmentDownload,
  uploadInlineImage
};
