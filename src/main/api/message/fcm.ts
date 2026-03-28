import { apiClient } from '@/main/api/apiClient';
import nodeMachine from 'node-machine-id';

/**
 * Save the FCM token for a user identified by the Firebase UID.
 * @param {string} fcmToken - The FCM token to be saved.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
export const saveFcmToken = (uid: string, fcmToken: string, signal?: AbortSignal) => {
  const id = nodeMachine.machineIdSync(true);
  return apiClient.post<void>(
    `/fcm`,
    {
      fcmToken: fcmToken,
      machineUuid: id
    },
    {
      signal,
      uid
    }
  );
};

export interface MessageAddedPayload {
  aAUid: string;
  labels: string;
  id: string;
  threadId: string;
  type: 'MESSAGE_ADDED';
  verification: 'true' | 'false';
  link: string;
  code: string;
}

export interface AIDraftAddedPayload {
  aAUid: string;
  id: string;
  threadId: string;
  type: 'AI_DRAFT_ADDED';
}

export interface MessageDeletedPayload {
  id: string;
  type: 'MESSAGE_DELETED';
  threadId: string;
  aAUid: string;
}

export interface MessageLabelModificationPayload {
  id: string;
  type: 'LABEL_ADDED' | 'LABEL_REMOVED';
  threadId: string;
  labels: string;
  aAUid: string;
}

export default {
  saveFcmToken
};
