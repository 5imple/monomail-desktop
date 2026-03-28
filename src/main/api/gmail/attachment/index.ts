import { apiClient } from '@/main/api/apiClient';
import { GmailMessageAttachmentResponse } from '@/main/api/gmail/types';

/**
 * Get an attachment from a message.
 * @param {string} messageId - The ID of the message.
 * @param {string} id - The ID of the attachment.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailMessageAttachmentResponse>} The attachment details.
 */
const getAttachmentInline = (uid: string, messageId: string, id: string, signal?: AbortSignal) => {
  return apiClient.get<GmailMessageAttachmentResponse>(
    `/gmail/messages/${messageId}/attachments/${id}`,
    {
      uid,
      signal
    }
  );
};
/**
 * Get an attachment from a message.
 * @param {string} messageId - The ID of the message.
 * @param {string} id - The ID of the attachment.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailMessageAttachmentResponse>} The attachment details.
 */
const getAttachmentDownload = (
  uid: string,
  messageId: string,
  id: string,
  fileName: string,
  signal?: AbortSignal
) => {
  const params = new URLSearchParams();
  params.append('fileName', fileName);
  return apiClient.get<Blob>(
    `/gmail/messages/${messageId}/attachments/${id}/download?${params.toString()}`,
    { responseType: 'blob', signal, uid }
  );
};
export default { getAttachmentInline, getAttachmentDownload };
