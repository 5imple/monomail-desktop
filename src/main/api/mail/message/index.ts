import { gmailApiClient } from '@/main/api/apiClient';
import { MailMessage, MailThreadUpdateResponse } from '@/main/api/mail/types';
import { transformMessage, RawGmailMessage } from '@/main/api/mail/transforms';

const getMessage = async (uid: string, id: string, signal?: AbortSignal): Promise<MailMessage> => {
  const raw = await gmailApiClient.get<RawGmailMessage>(`/messages/${id}?format=full`, {
    uid,
    signal,
  });
  return transformMessage(raw);
};

const getMessageUnsubscribe = async (uid: string, id: string, signal?: AbortSignal) => {
  // Fetch metadata format — only need headers, no body
  const raw = await gmailApiClient.get<RawGmailMessage>(
    `/messages/${id}?format=metadata&metadataHeaders=List-Unsubscribe`,
    { uid, signal }
  );
  const msg = transformMessage(raw);
  return { id: msg.id, listUnsubscribe: msg.listUnsubscribe };
};

// Gmail's unsubscribe is handled client-side via the List-Unsubscribe URL/mailto.
// This stub satisfies call sites that POST to trigger server-side unsubscribe.
const postMessageUnsubscribe = async (_uid: string, _id: string, _signal?: AbortSignal) => {
  // No-op for direct Gmail — callers use the URL/mailto from getMessageUnsubscribe.
};

const modifyMessage = async (
  uid: string,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
): Promise<MailThreadUpdateResponse> => {
  return gmailApiClient.post<MailThreadUpdateResponse>(
    `/messages/${id}/modify`,
    { addLabelIds, removeLabelIds },
    { uid, signal }
  );
};

// The Message-ID and References of a message, for a reply's In-Reply-To /
// References headers (see buildRawMessage).
const getReplyHeaders = async (
  uid: string,
  id: string,
  signal?: AbortSignal
): Promise<{ messageId?: string; references?: string }> => {
  const raw = await gmailApiClient.get<RawGmailMessage>(
    `/messages/${id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
    { uid, signal }
  );
  const headers: { name: string; value: string }[] = raw.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
  return { messageId: header('Message-ID'), references: header('References') };
};

// Direct Gmail send. `raw` is a base64url-encoded RFC822 message; passing
// `threadId` threads replies/forwards in Gmail without needing In-Reply-To.
const sendMessage = async (
  uid: string,
  raw: string,
  threadId?: string,
  signal?: AbortSignal
): Promise<{ id: string; threadId: string }> => {
  return gmailApiClient.post<{ id: string; threadId: string }>(
    '/messages/send',
    { raw, ...(threadId ? { threadId } : {}) },
    { uid, signal }
  );
};

export default {
  getMessage,
  getMessageUnsubscribe,
  postMessageUnsubscribe,
  modifyMessage,
  getReplyHeaders,
  sendMessage,
};
