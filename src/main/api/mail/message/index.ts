import { apiClient } from '@/main/api/apiClient';
import { MailMessage, MailThreadUpdateResponse } from '@/main/api/mail/types';

const getMessage = async (uid: string, id: string, signal?: AbortSignal): Promise<MailMessage> => {
  return await apiClient.get<MailMessage>(`/mail/messages/${id}`, { uid, signal });
};

const getMessageUnsubscribe = async (uid: string, id: string, signal?: AbortSignal) => {
  return await apiClient.get<Pick<MailMessage, 'listUnsubscribe' | 'id'>>(
    `/mail/messages/${id}/unsubscribe`,
    { uid, signal }
  );
};

const postMessageUnsubscribe = async (uid: string, id: string, signal?: AbortSignal) => {
  return await apiClient.post<void>(`/mail/messages/${id}/unsubscribe`, {}, { uid, signal });
};

const modifyMessage = async (
  uid: string,
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[],
  signal?: AbortSignal
) => {
  const data = { addLabelIds, removeLabelIds };
  return await apiClient.patch<MailThreadUpdateResponse>(`/mail/messages/${id}/modify`, data, {
    uid,
    signal
  });
};

export default {
  getMessage,
  getMessageUnsubscribe,
  postMessageUnsubscribe,
  modifyMessage
};
