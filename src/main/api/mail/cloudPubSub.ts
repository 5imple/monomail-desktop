import { apiClient } from '@/main/api/apiClient';

const watchCloudPubSub = (uid: string, signal?: AbortSignal) => {
  return apiClient.post<{ historyId: string; expiration: string }>(
    `/mail/watch`,
    {},
    {
      signal,
      headers: {
        'X-Mono-Account': uid
      }
    }
  );
};

const stopCloudPubSub = (uid: string, signal?: AbortSignal) => {
  return apiClient.post<void>(
    `/mail/stop`,
    {},
    {
      signal,
      headers: {
        'X-Mono-Account': uid
      }
    }
  );
};

const stopAllCloudPubSub = (signal?: AbortSignal) => {
  return apiClient.post<void>(`/mail/stop/all`, {}, { signal });
};

export default { watchCloudPubSub, stopCloudPubSub, stopAllCloudPubSub };
