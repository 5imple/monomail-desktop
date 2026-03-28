import aiApi from '@/main/api/ai/aiApi';
import { AccountAutopilotSettings, AutopilotSettingsResponse } from '@/main/api/ai/settings';
import { apiClient } from '@/main/api/apiClient';
import { atom, useAtom } from 'jotai';
import { toast } from 'sonner';

// Create a single atom to store all AI settings
const autopilotSettingsAtom = atom<AutopilotSettingsResponse>({});
const loadingAtom = atom(false);

/**
 * Custom hook for managing AI Settings using Jotai
 */
export const useAutopilotSettings = () => {
  const [autopilotSettings, setAutopilotSettings] = useAtom(autopilotSettingsAtom);
  const [isLoading, setIsLoading] = useAtom(loadingAtom);

  // Helper function to get AI settings for a specific account
  const getAutopilotSettingsForAccount = (
    accountId: string
  ): AccountAutopilotSettings | undefined => {
    return autopilotSettings[accountId];
  };

  // Helper function to get voice profiles for a specific account
  const getVoiceProfilesForAccount = (accountId: string): string[] => {
    return autopilotSettings[accountId]?.voiceProfiles || [];
  };

  // Helper function to check if autopilot is enabled for an account
  const isAutopilotEnabled = (accountId: string): boolean => {
    return autopilotSettings[accountId]?.enableAutoPilot || false;
  };

  // Helper function to check if voice profiles are enabled for an account
  const isVoiceProfilesEnabled = (accountId: string): boolean => {
    return autopilotSettings[accountId]?.enableVoiceProfiles || false;
  };

  // Load AI settings from API - loads all settings for all accounts at once
  const loadAutopilotSettings = async () => {
    // If we already have data, don't reload
    if (Object.keys(autopilotSettings).length > 0) {
      return;
    }

    setIsLoading(true);

    try {
      // Call API to get all settings for all accounts
      const response = await aiApi.getAutopilotSettings();

      // Store the response directly as it's already in the format we need
      setAutopilotSettings(response);
    } catch (error) {
      console.error('Error loading AI settings:', error);

      // Set empty object if API fails
      setAutopilotSettings({});
    } finally {
      setIsLoading(false);
    }
  };

  // Function to update voice profiles for a specific account with optimistic updates
  const setVoiceProfilesForAccount = async (accountId: string, profiles: string[]) => {
    // Store current state in case we need to rollback
    const previousSettings = { ...autopilotSettings };

    try {
      // Optimistically update local state immediately
      setAutopilotSettings((prevState) => ({
        ...prevState,
        [accountId]: {
          ...prevState[accountId],
          voiceProfiles: profiles
        }
      }));

      const payload = {
        [accountId]: profiles
      };

      // Call API to persist the changes
      apiClient.setApiActiveUid(accountId);
      await aiApi.updateVoiceProfiles(payload);

      // Success notification can be shown here if needed
    } catch (error) {
      // If API call fails, revert to previous state
      setAutopilotSettings(previousSettings);

      // Show error notification
      console.error('Error updating voice profiles:', error);

      // Re-throw the error if needed by the caller
      throw error;
    }
  };

  // Function to update autopilot setting for a specific account
  const setAutopilotForAccount = async (accountId: string, enabled: boolean) => {
    // Store current state in case we need to rollback
    const previousSettings = { ...autopilotSettings };

    try {
      // Optimistically update local state immediately
      setAutopilotSettings((prevState) => ({
        ...prevState,
        [accountId]: {
          ...prevState[accountId],
          enableAutoPilot: enabled
        }
      }));

      const payload = {
        [accountId]: enabled
      };

      // Call API to persist the changes
      apiClient.setApiActiveUid(accountId);
      await aiApi.updateAutopilot(payload);
    } catch (error) {
      // If API call fails, revert to previous state
      setAutopilotSettings(previousSettings);

      // Show error notification
      console.error('Error updating autopilot setting:', error);

      // Re-throw the error if needed by the caller
      throw error;
    }
  };

  // Function to update voice profiles enabled setting for a specific account
  const setVoiceProfilesEnabledForAccount = async (accountId: string, enabled: boolean) => {
    // Store current state in case we need to rollback
    const previousSettings = { ...autopilotSettings };

    try {
      // Optimistically update local state immediately
      setAutopilotSettings((prevState) => ({
        ...prevState,
        [accountId]: {
          ...prevState[accountId],
          enableVoiceProfiles: enabled
        }
      }));

      const payload = {
        [accountId]: enabled
      };

      // Call API to persist the changes
      apiClient.setApiActiveUid(accountId);
      await aiApi.updateVoiceProfilesEnabled(payload);
    } catch (error) {
      // If API call fails, revert to previous state
      setAutopilotSettings(previousSettings);

      // Show error notification
      console.error('Error updating voice profiles enabled setting:', error);

      // Re-throw the error if needed by the caller
      throw error;
    }
  };
  const updateAllSettingsForAccount = async (
    accountId: string,
    settings: {
      enableAutoPilot?: boolean;
      enableVoiceProfiles?: boolean;
      voiceProfiles?: string[];
    }
  ) => {
    // Store current state in case we need to rollback
    const previousSettings = { ...autopilotSettings };

    setIsLoading(true);

    try {
      // Optimistically update local state immediately
      setAutopilotSettings((prevState) => ({
        ...prevState,
        [accountId]: {
          ...prevState[accountId],
          enableAutoPilot: settings.enableAutoPilot ?? prevState[accountId]?.enableAutoPilot,
          enableVoiceProfiles:
            settings.enableVoiceProfiles ?? prevState[accountId]?.enableVoiceProfiles,
          voiceProfiles: settings.voiceProfiles ?? prevState[accountId]?.voiceProfiles
        }
      }));

      // Create an array of promises for all the API calls
      const apiCalls: Promise<void>[] = [];

      // Add autopilot update if provided
      if (settings.enableAutoPilot !== undefined) {
        const autopilotPayload = {
          [accountId]: settings.enableAutoPilot
        };
        apiCalls.push(aiApi.updateAutopilot(autopilotPayload));
      }

      // Add voice profiles enabled update if provided
      if (settings.enableVoiceProfiles !== undefined) {
        const voiceProfilesEnabledPayload = {
          [accountId]: settings.enableVoiceProfiles
        };
        apiCalls.push(aiApi.updateVoiceProfilesEnabled(voiceProfilesEnabledPayload));
      }

      // Add voice profiles update if provided
      if (settings.voiceProfiles !== undefined) {
        const voiceProfilesPayload = {
          [accountId]: settings.voiceProfiles
        };
        apiCalls.push(aiApi.updateVoiceProfiles(voiceProfilesPayload));
      }

      // Execute all API calls concurrently
      await Promise.all(apiCalls);
    } catch (error) {
      // If any API call fails, revert to previous state
      setAutopilotSettings(previousSettings);

      // Show error notification
      console.error('Error updating settings:', error);

      // Re-throw the error if needed by the caller
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    // State
    autopilotSettings,
    isLoading,
    updateAllSettingsForAccount,

    // Getters
    getAutopilotSettingsForAccount,
    getVoiceProfilesForAccount,
    isAutopilotEnabled,
    isVoiceProfilesEnabled,

    // Actions
    loadAutopilotSettings,
    setVoiceProfilesForAccount,
    setAutopilotForAccount,
    setVoiceProfilesEnabledForAccount
  };
};
