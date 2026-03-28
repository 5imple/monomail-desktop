import { apiClient } from '@/main/api/apiClient';
import { GmailMessage, GmailThreadGetResponse } from '@/main/api/gmail/types';

/**
 * Create a new public share for a message or thread.
 * @param {string} dataId - The ID of the data (message or thread) to share.
 * @param {boolean} published - Shared visibility.
 * @param {'MESSAGE' | 'THREAD'} sharedDataType - The type of data being shared.
 * @param {'PRIVATE' | 'WORKSPACE' | 'PUBLIC'} access - The access level for the shared item.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CreateLinkShareResponse>} The response from the API.
 */
const createLinkShare = async ({
  dataId,
  sharedDataType,
  access,
  published,
  signal
}: {
  dataId: string;
  published: boolean;
  sharedDataType: 'MESSAGE' | 'THREAD';
  access: 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
  signal?: AbortSignal;
}) => {
  const data = {
    dataId,
    sharedDataType,
    published,
    access
  };

  return await apiClient.post<CreateLinkShareResponse>(`/mono/share/create`, data, {
    signal
  });
};

/**
 * Update the public share.
 * @param {string} sharedEmailId - The ID of the shared email.
 * @param {'PRIVATE' | 'WORKSPACE' | 'PUBLIC'} access - The access level for the shared item.
 * @param {boolean} published - Shared visibility.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<UpdateLinkShareResponse>} The response from the API.
 */
const updateLinkShare = async ({
  sharedEmailId,
  access,
  published,
  signal
}: {
  sharedEmailId: string;
  access: 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
  published: boolean;
  signal?: AbortSignal;
}) => {
  const data = {
    access,
    published
  };

  return await apiClient.patch<UpdateLinkShareResponse>(
    `/mono/share/${sharedEmailId}/update`,
    data,
    { signal }
  );
};

/**
 * Get details of a public share by its ID.
 * @param {string} dataId - The ID of the shared data (message or thread).
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GetLinkShareResponse>} The response from the API.
 */
const getLinkShare = async ({ dataId, signal }: { dataId: string; signal?: AbortSignal }) => {
  return await apiClient.get<GetLinkShareResponse>(`/mono/share/${dataId}`, {
    signal
  });
};

/**
 * Get list of shared emails owned by the current user.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<OwnerShareResponse[]>} The list of shared emails owned by the user.
 */
const getOwnerShares = async ({ signal }: { signal?: AbortSignal } = {}) => {
  return await apiClient.get<OwnerShareResponse[]>(`/mono/share/owner`, {
    signal
  });
};

/**
 * Get shared emails organized by account ID for all member accounts.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoShareResponse>} Map of accountId to shared item arrays.
 */
const getMonoShares = async ({ signal }: { signal?: AbortSignal } = {}) => {
  return await apiClient.get<MonoShareResponse>(`/mono/share`, {
    signal
  });
};

export default {
  getLinkShare,
  createLinkShare,
  updateLinkShare,
  getOwnerShares,
  getMonoShares
};

// Define the response types based on the API documentation
interface CreateLinkShareResponse {
  createdAt: Date;
  updatedAt: Date;
  id: string;
  access: 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
  dataId: string;
  sharedDataType: 'MESSAGE' | 'THREAD';
  published: boolean;
}

interface UpdateLinkShareResponse {
  createdAt: Date;
  updatedAt: Date;
  id: string;
  access: 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
  dataId: string;
  sharedDataType: 'MESSAGE' | 'THREAD';
  published: boolean;
}

interface GetLinkShareResponse {
  sharedEmailData: GmailThreadGetResponse | GmailMessage;
  sharedDataType: 'MESSAGE' | 'THREAD';
}

interface OwnerShareResponse {
  id: string;
  access: 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
  dataId: string;
  sharedDataType: 'MESSAGE' | 'THREAD';
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response type for GET /mono/share endpoint
 * Returns a map of account IDs to their shared items
 */
interface MonoShareResponse {
  [accountId: string]: OwnerShareResponse[];
}
