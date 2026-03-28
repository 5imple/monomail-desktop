import { apiClient } from '@/main/api/apiClient';
import { MailHistoryListResponse } from '@/main/api/mail/types';

const getHistoryList = async (
  uid: string,
  historyId: string,
  pageToken?: string,
  signal?: AbortSignal
): Promise<MailHistoryListResponse> => {
  const params = new URLSearchParams();
  params.append('historyId', historyId);
  if (pageToken) params.append('pageToken', pageToken);
  return await apiClient.get<MailHistoryListResponse>(`/mail/histories?${params.toString()}`, {
    uid,
    signal
  });
};

export default { getHistoryList };
