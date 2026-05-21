import { apiClient } from '@/main/api/apiClient';
import {
  GmailMessage,
  GmailMessageSendResponse,
  GmailThreadUpdateResponse
} from '@/main/api/gmail/types';

type MessageProtocol = {
  to: string;
  subject: string;
  body: string;
  files?: File[];
  cc?: string;
  bcc?: string;
  type?: 'normal' | 'reply' | 'forward';
  messageId?: string; // Optional for reply/forward
};

/**
 * Get a specific message by ID.
 * @param {string} id - The ID of the message.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailMessage>} The thread details.
 */
const getMessage = (uid: string, id: string, signal?: AbortSignal) => {
  return apiClient.get<GmailMessage>(`/gmail/messages/${id}`, {
    uid,
    signal
  });
};

/**
 * Get a specific message by ID.
 * @param {string} id - The ID of the message.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<Pick<GmailMessage, 'listUnsubscribe' | 'id'>>} The thread details.
 */
const getMessageUnsubscribe = (uid: string, id: string, signal?: AbortSignal) => {
  return apiClient.get<Pick<GmailMessage, 'listUnsubscribe' | 'id'>>(
    `/gmail/messages/${id}/unsubscribe`,
    {
      uid,
      signal
    }
  );
};
/**
 * Get a specific message by ID.
 * @param {string} id - The ID of the message.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The thread details.
 */
const postMessageUnsubscribe = (uid: string, id: string, signal?: AbortSignal) => {
  return apiClient.post<void>(`/gmail/messages/${id}/unsubscribe`, {}, { uid, signal });
};

/**
 * Send a message with optional type and message ID for replies and forwards.
 * @param {string} aAUid - The active account Id.
 * @param {MessageProtocol} message - The message data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailMessageSendResponse>} The response from the API.
 */
const sendMessage = ({
  uid,
  aAUid,
  message,
  signal
}: {
  uid: string;
  aAUid: string;
  message: MessageProtocol;
  signal?: AbortSignal;
}) => {
  const params = new URLSearchParams();
  params.append('aAUid', aAUid);
  const formData = new FormData();

  formData.append('mailto', message.to);
  formData.append('subject', message.subject);
  formData.append('body', message.body);

  if (message.files) {
    message.files.forEach((file) => formData.append('files', file));
  }
  if (message.cc) formData.append('cc', message.cc);
  if (message.bcc) formData.append('bcc', message.bcc);
  if (message.type) formData.append('type', message.type);
  if (message.messageId && (message.type === 'reply' || message.type === 'forward')) {
    formData.append('messageId', message.messageId);
  }

  return apiClient.post<GmailMessageSendResponse>(
    `/gmail/messages/send?${params.toString()}`,
    formData,
    {
      signal,
      uid
    }
  );
};

/**
 * Modify a message by adding or removing labels.
 * @param {string} id - The ID of the ,essage.
 * @param {string[]} addLabelIds - The IDs of labels to add.
 * @param {string[]} removeLabelIds - The IDs of labels to remove.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GmailThreadUpdateResponse>} The response from the API.
 */
const modifyMessage = (
  uid: string,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
) => {
  const data = { addLabelIds, removeLabelIds };

  return apiClient.patch<GmailThreadUpdateResponse>(`/gmail/messages/${id}/modify`, data, {
    uid,
    signal
  });
};

export default {
  sendMessage,
  getMessageUnsubscribe,
  postMessageUnsubscribe,
  modifyMessage,
  getMessage
};
