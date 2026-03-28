import { apiClient } from '@/main/api/apiClient';
import { MonoMember, GetMonoAccountResponse, UserPreference } from '@/main/api/auth/types';
import {
  networkFirstCache,
  CACHE_KEYS,
  CACHE_TTL
} from '@/renderer/app/lib/cache/networkFirstCache';

/**
 * Fetches user profile by email.
 *
 * @param {string} email - The email to search user profile.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const getAccountProfileByEmail = (email: string, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  params.append('email', email);
  return apiClient.get(`/profile?${params.toString()}`, { signal });
};

/**
 * Fetches user profile
 *
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GetMonoAccountResponse>} The response from the API.
 */
const getMonoAccount = (signal?: AbortSignal): Promise<GetMonoAccountResponse> => {
  return apiClient.get<GetMonoAccountResponse>(`/mono/user/info`, { signal });
};

/**
 * Fetches user preferences
 *
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<UserPreference>} The response from the API.
 */
const getUserPreference = (signal?: AbortSignal): Promise<UserPreference> => {
  return apiClient.get<UserPreference>(`/mono/preference`, { signal });
};

/**
 * Updates user preferences
 *
 * @param {Partial<UserPreference>} preference - The updated preferences.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const updateUserPreference = (preference: Partial<UserPreference>, signal?: AbortSignal) => {
  return apiClient.patch(`/mono/preference`, { preference }, { signal });
};

/**
 * delete user
 *
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const deleteUser = (signal?: AbortSignal) => {
  return apiClient.delete(`/mono/user/delete`, { signal });
};

/**
 * unlink account from user
 *
 * @param {string} accountUid - The accountUid to unlink from user.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const unlinkAccountFromUser = (accountUid: string, signal?: AbortSignal) => {
  const params = new URLSearchParams();
  params.append('uid', accountUid);
  return apiClient.post(`/mono/user/unlink?${params.toString()}`, { signal });
};

/**
 * Updates user primary account
 *
 * @param {string} to - The updated uid.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<{token: string}>} The response from the API.
 */
const updatePrimaryAccount = (to: string, signal?: AbortSignal) => {
  return apiClient.post<{ token: string }>(
    `/mono/user/change-primary-account`,
    { uid: to },
    { signal }
  );
};

/**
 * Updates user profile
 *
 * @param {Partial<UserPreference>} preference - The updated profile.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const updateUserProfile = (
  preference: {
    language: UserPreference['language'];
    displayName: MonoMember['displayName'];
  },
  signal?: AbortSignal
) => {
  return apiClient.patch(
    `/mono/user/change-profile`,
    { ...preference },
    {
      signal
    }
  );
};

/**
 * Create member
 *
 * @param {Object} [deviceInfo] - The device information to include in the request.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<GetMonoAccountResponse>} The response from the API.
 */
const createMember = (
  deviceInfo?: {
    browser: string;
    os: string;
    device: string;
    language: string;
    platform: string;
    timeZone: string;
  },
  signal?: AbortSignal
): Promise<GetMonoAccountResponse> => {
  return apiClient.post<GetMonoAccountResponse>(`/mono/user/create`, {
    device: deviceInfo,
    signal
  });
};

/**
 * Updates user demographics.
 *
 * @param {Object} demographics - The updated demographics data.
 * @param {string} demographics.role - The user's role.
 * @param {string} demographics.emailUsage - The user's email usage type.
 * @param {string} demographics.discoverySource - How the user discovered Mono Mail.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const updateUserDemographics = (
  demographics: { role: string; emailUsage: string; discoverySource: string },
  signal?: AbortSignal
) => {
  return apiClient.put(`/mono/user/demographics`, demographics, { signal });
};

/**
 * Sets or updates the user's timezone.
 *
 * @param {string} timezone - The user's timezone.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} The response from the API.
 */
const updateUserTimezone = (timezone: string, signal?: AbortSignal) => {
  return apiClient.put(`/mono/user/timezone`, { timezone }, { signal });
};

export default {
  getAccountProfileByEmail,
  getMonoAccount,
  getUserPreference,
  updateUserPreference,
  deleteUser,
  unlinkAccountFromUser,
  updatePrimaryAccount,
  updateUserProfile,
  createMember,
  updateUserDemographics,
  updateUserTimezone
};
