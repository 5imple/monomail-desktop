import { apiClient } from '@/main/api/apiClient';
import { MailMessageAttachmentResponse } from '@/main/api/mail/types';

const getAttachmentInline = async (
  uid: string,
  messageId: string,
  id: string,
  signal?: AbortSignal
): Promise<MailMessageAttachmentResponse> => {
  return await apiClient.get<MailMessageAttachmentResponse>(
    `/mail/messages/${messageId}/attachments/${id}`,
    { uid, signal }
  );
};

const getAttachmentDownload = async (
  uid: string,
  messageId: string,
  id: string,
  fileName: string,
  signal?: AbortSignal
): Promise<Blob> => {
  const params = new URLSearchParams();
  params.append('fileName', fileName);
  return await apiClient.get<Blob>(
    `/mail/messages/${messageId}/attachments/${id}/download?${params.toString()}`,
    { responseType: 'blob', signal, uid }
  );
};

export default { getAttachmentInline, getAttachmentDownload };
