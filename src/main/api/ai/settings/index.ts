import { apiClient } from '@/main/api/apiClient';

/**
 * Individual account AI settings
 */
export interface AccountAutopilotSettings {
  enableAutoPilot: boolean;
  enableVoiceProfiles: boolean;
  voiceProfiles: string[];
}

/**
 * Response structure when retrieving AI settings
 */
export interface AutopilotSettingsResponse {
  [accountId: string]: AccountAutopilotSettings;
}

/**
 * Request structure for updating voice profiles
 */
export interface VoiceProfilesUpdateRequest {
  [accountId: string]: string[];
}

/**
 * Request structure for updating autopilot settings
 */
export interface AutopilotUpdateRequest {
  [accountId: string]: boolean;
}

/**
 * Request structure for updating voice profiles enabled status
 */
export interface VoiceProfilesEnabledUpdateRequest {
  [accountId: string]: boolean;
}

/**
 * Get all AI settings for the authenticated user across accounts.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<AutopilotSettingsResponse>} Map of account IDs to their AI settings.
 */
const getAutopilotSettings = (signal?: AbortSignal): Promise<AutopilotSettingsResponse> => {
  return apiClient.get<AutopilotSettingsResponse>('/mono/ai/settings', {
    signal
  });
};

/**
 * Update voice profiles for one or more accounts.
 * @param {VoiceProfilesUpdateRequest} voiceProfiles - Map of account IDs to their voice profile arrays.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Promise that resolves when the update completes.
 */
const updateVoiceProfiles = (
  voiceProfiles: VoiceProfilesUpdateRequest,
  signal?: AbortSignal
): Promise<void> => {
  return apiClient.put('/mono/ai/settings/voice-profiles', voiceProfiles, {
    signal
  });
};

/**
 * Update autopilot settings for one or more accounts.
 * @param {AutopilotUpdateRequest} autopilotSettings - Map of account IDs to their autopilot enabled status.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Promise that resolves when the update completes.
 */
const updateAutopilot = (
  autopilotSettings: AutopilotUpdateRequest,
  signal?: AbortSignal
): Promise<void> => {
  return apiClient.patch('/mono/ai/settings/autopilot', autopilotSettings, {
    signal
  });
};

/**
 * Update voice profiles enabled status for one or more accounts.
 * @param {VoiceProfilesEnabledUpdateRequest} enabledSettings - Map of account IDs to their enabled status.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} Promise that resolves when the update completes.
 */
const updateVoiceProfilesEnabled = (
  enabledSettings: VoiceProfilesEnabledUpdateRequest,
  signal?: AbortSignal
): Promise<void> => {
  return apiClient.patch('/mono/ai/settings/voice-profiles/enabled', enabledSettings, {
    signal
  });
};

export default {
  getAutopilotSettings,
  updateVoiceProfiles,
  updateAutopilot,
  updateVoiceProfilesEnabled
};
