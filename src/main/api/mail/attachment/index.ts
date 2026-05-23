import { gmailApiClient } from '@/main/api/apiClient';
import { MailMessageAttachmentResponse } from '@/main/api/mail/types';

// Gmail returns attachment data base64url-encoded. Decode to standard base64
// so atob() works correctly in the renderer.
function base64urlToBase64(b64url: string): string {
  return b64url.replace(/-/g, '+').replace(/_/g, '/');
}

interface RawAttachmentResponse {
  size: number;
  attachmentId: string;
  data: string;
}

const getAttachmentInline = async (
  uid: string,
  messageId: string,
  id: string,
  signal?: AbortSignal
): Promise<MailMessageAttachmentResponse> => {
  const raw = await gmailApiClient.get<RawAttachmentResponse>(
    `/messages/${messageId}/attachments/${id}`,
    { uid, signal }
  );
  // The caller (processInlineImages) uses raw base64 data; normalize to standard base64
  return {
    attachmentId: raw.attachmentId ?? id,
    size: raw.size,
    data: base64urlToBase64(raw.data ?? ''),
    mimeType: '', // Gmail attachment endpoint doesn't return mimeType; caller resolves via inlineImages map
  };
};

const getAttachmentDownload = async (
  uid: string,
  messageId: string,
  id: string,
  _fileName: string,
  signal?: AbortSignal
): Promise<Blob> => {
  const raw = await gmailApiClient.get<RawAttachmentResponse>(
    `/messages/${messageId}/attachments/${id}`,
    { uid, signal }
  );
  const base64 = base64urlToBase64(raw.data ?? '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes]);
};

export default { getAttachmentInline, getAttachmentDownload };
