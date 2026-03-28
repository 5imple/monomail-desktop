import { apiClient } from '@/main/api/apiClient';
import aiSearch from '@/main/api/gmail/aiSearch';
import attachment from '@/main/api/gmail/attachment';
import drafts from '@/main/api/gmail/drafts';
import history from '@/main/api/gmail/history';
import label from '@/main/api/gmail/label';
import message from '@/main/api/gmail/message';
import reminder from '@/main/api/gmail/reminder';
import thread from '@/main/api/gmail/thread';

/**
 * Watch Cloud Pub/Sub for Gmail nwotifications.
 * @param {string} uid - The UserId to watch
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{ historyId: string, expiration: string }>} The response from the API with historyId and expiration.
 */
const watchCloudPubSub = (uid: string, signal?: AbortSignal) => {
  // const labels = [...labelIds.filter((id) => id !== 'DRAFT'), 'DRAFT'];
  return apiClient.post<{ historyId: string; expiration: string }>(
    `/gmail/watch`,
    {},
    {
      signal,
      headers: {
        'X-Mono-Account': uid
      }
    }
  );
};

/**
 * Watch Cloud Pub/Sub for Gmail notifications.
 * @param {string} uid - The UserId to watch
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{ historyId: string, expiration: string }>} The response from the API with historyId and expiration.
 */
const stopCloudPubSub = (uid: string, signal?: AbortSignal) => {
  return apiClient.post<void>(
    `/gmail/stop`,
    {},
    {
      signal,
      headers: {
        'X-Mono-Account': uid
      }
    }
  );
}; /**
 * Watch Cloud Pub/Sub for Gmail notifications.
 * @param {string} uid - The UserId to watch
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{ historyId: string, expiration: string }>} The response from the API with historyId and expiration.
 */
const stopAllCloudPubSub = (signal?: AbortSignal) => {
  return apiClient.post<void>(`/gmail/stop/all`, {
    signal
  });
};

export default {
  ...thread,
  ...message,
  ...history,
  ...attachment,
  ...drafts,
  ...label,
  ...reminder,
  ...aiSearch,
  watchCloudPubSub,
  stopCloudPubSub,
  stopAllCloudPubSub
};
