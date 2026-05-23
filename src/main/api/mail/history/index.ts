import { gmailApiClient } from '@/main/api/apiClient';
import { MailHistoryListResponse } from '@/main/api/mail/types';
import { transformHistoryList, RawGmailHistoryListResponse } from '@/main/api/mail/transforms';

const getHistoryList = async (
  uid: string,
  historyId: string,
  pageToken?: string,
  signal?: AbortSignal
): Promise<MailHistoryListResponse> => {
  const params = new URLSearchParams({ startHistoryId: historyId });
  if (pageToken) params.set('pageToken', pageToken);
  const raw = await gmailApiClient.get<RawGmailHistoryListResponse>(
    `/history?${params.toString()}`,
    { uid, signal }
  );
  return transformHistoryList(raw);
};

export default { getHistoryList };
