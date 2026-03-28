import aiApi from '@/main/api/ai/aiApi';
import { AIFilterRequest } from '@/main/api/ai/types';
import { apiClient } from '@/main/api/apiClient';
import { atom, useAtom } from 'jotai';
import { toast } from 'sonner';

// Type definitions for our AI filters
export interface AIFilter {
  id: string;
  name: string;
  prompt: string;
  outputLabels: string[];
  markAsDone: boolean;
  moveToTrash: boolean;
  isActive?: boolean;
  templateLabelName?: string;
  templateLabelColor?: {
    backgroundColor: string;
    textColor: string;
  };
}

// Create a record atom to store filters by account ID
const aiFiltersAtom = atom<Record<string, AIFilter[]>>({});
const loadingStateAtom = atom<Record<string, boolean>>({});

/**
 * Custom hook for managing AI Filters using Jotai
 */
export const useAIFilters = () => {
  const [filtersRecord, setFiltersRecord] = useAtom(aiFiltersAtom);
  const [loadingRecord, setLoadingRecord] = useAtom(loadingStateAtom);

  // Helper function to get filters for a specific account
  const getFiltersForAccount = (accountId: string): AIFilter[] => {
    return filtersRecord[accountId] || [];
  };

  // Helper function to set loading state for a specific account
  const setLoadingForAccount = (accountId: string, isLoading: boolean) => {
    setLoadingRecord((prev) => ({
      ...prev,
      [accountId]: isLoading
    }));
  };

  // Helper function to update filters for a specific account
  const updateFiltersForAccount = (accountId: string, filters: AIFilter[]) => {
    setFiltersRecord((prev) => ({
      ...prev,
      [accountId]: filters
    }));
  };

  // Load AI filters from API
  const loadAIFilters = async (accountId: string) => {
    // Check if we've already loaded for this account and have data
    if (filtersRecord[accountId]?.length > 0) {
      return;
    }

    setLoadingForAccount(accountId, true);

    try {
      // Call API to get filters
      const response = await aiApi.getAIFilters(accountId);

      // Map backend response to frontend model if needed
      const filters = response.map((filter) => {
        // Ensure filters with no output labels are always inactive
        const isActive = filter.outputLabels.length === 0 ? false : filter.isActive;

        return {
          id: filter.id,
          name: filter.name,
          prompt: filter.prompt,
          outputLabels: filter.outputLabels,
          markAsDone: filter.markAsDone,
          moveToTrash: filter.moveToTrash,
          isActive
        };
      });

      updateFiltersForAccount(accountId, filters);
    } catch (error) {
      console.error('Error loading AI filters:', error);

      // Set empty array if API fails
      updateFiltersForAccount(accountId, []);
    } finally {
      setLoadingForAccount(accountId, false);
    }
  };

  // Create a new AI filter with optimistic updates
  const createAIFilter = async (accountId: string, filterData: AIFilter) => {
    try {
      // Ensure filter is inactive if no output labels
      const isActive = filterData.outputLabels.length === 0 ? false : (filterData.isActive ?? true);

      // Prepare the request data
      const requestData = {
        id: filterData.id,
        name: filterData.name,
        prompt: filterData.prompt,
        outputLabels: filterData.outputLabels,
        moveToTrash: filterData.moveToTrash,
        markAsDone: filterData.markAsDone,
        isActive
      };

      // Optimistically update local state
      const optimisticFilter = { ...requestData };
      const currentFilters = getFiltersForAccount(accountId);
      updateFiltersForAccount(accountId, [...currentFilters, optimisticFilter]);

      // Call the API to create the filter
      await aiApi.createAIFilter(accountId, requestData);

      // toast.success('AI Filter created');

      // Return the created filter
      return optimisticFilter;
    } catch (error) {
      console.error('Error creating AI filter:', error);
      toast.error('Failed to create AI filter');

      // Revert optimistic update
      await loadAIFilters(accountId);

      throw error;
    }
  };

  const createAIFiltersBatch = async (accountId: string, filtersData: AIFilter[]) => {
    if (!filtersData.length) return [];

    try {
      // Prepare all filters
      const validatedFilters = filtersData.map((filterData) => ({
        ...filterData,
        isActive: filterData.outputLabels.length === 0 ? false : (filterData.isActive ?? true)
      }));

      // Optimistically update local state with all filters at once
      const currentFilters = getFiltersForAccount(accountId);
      updateFiltersForAccount(accountId, [...currentFilters, ...validatedFilters]);

      // Create all filters via API (you might need to implement batch API or use Promise.all)
      const creationPromises = validatedFilters.map((filter) =>
        aiApi.createAIFilter(accountId, filter)
      );

      await Promise.allSettled(creationPromises);

      return validatedFilters;
    } catch (error) {
      console.error('Error creating AI filters batch:', error);
      toast.error('Failed to create some AI filters');

      // Revert optimistic update
      await loadAIFilters(accountId);
      throw error;
    }
  };

  // Update an existing AI filter with optimistic updates
  const updateAIFilter = async (accountId: string, id: string, filterData: Partial<AIFilter>) => {
    try {
      // Find the current filter
      const currentFilters = getFiltersForAccount(accountId);
      const currentFilter = currentFilters.find((filter) => filter.id === id);

      if (!currentFilter) {
        throw new Error('Filter not found');
      }

      // Ensure filter is inactive if no output labels are set
      let updatedIsActive = filterData.isActive;
      if (filterData.outputLabels && filterData.outputLabels.length === 0) {
        updatedIsActive = false;
      } else if (currentFilter.outputLabels.length === 0) {
        // Check if the current labels are empty and we're not updating them
        updatedIsActive = false;
      }

      // Prepare the updated filter data
      const updatedFilter: AIFilter = {
        ...currentFilter,
        ...filterData,
        isActive: updatedIsActive
      };

      // Optimistically update local state
      const updatedFilters = currentFilters.map((filter) =>
        filter.id === id ? updatedFilter : filter
      );
      updateFiltersForAccount(accountId, updatedFilters);

      // Prepare the API request data
      const requestData: AIFilterRequest = {
        id: id,
        name: updatedFilter.name,
        prompt: updatedFilter.prompt,
        outputLabels: updatedFilter.outputLabels,
        moveToTrash: updatedFilter.moveToTrash,
        markAsDone: updatedFilter.markAsDone,
        isActive: updatedFilter.isActive ?? false
      };

      // Call the API to update the filter
      await aiApi.updateAIFilter(accountId, requestData);

      // toast.success('AI Filter updated');
    } catch (error) {
      console.error('Error updating AI filter:', error);
      toast.error('Failed to update AI filter');

      // Revert optimistic update
      await loadAIFilters(accountId);

      throw error;
    }
  };

  // Remove an AI filter with optimistic updates
  const removeAIFilter = async (accountId: string, id: string) => {
    try {
      // Optimistically update local state
      const currentFilters = getFiltersForAccount(accountId);
      const updatedFilters = currentFilters.filter((filter) => filter.id !== id);
      updateFiltersForAccount(accountId, updatedFilters);

      // Call the API to delete the filter
      await aiApi.deleteAIFilter(accountId, id);

      // toast.success('AI Filter removed');
    } catch (error) {
      console.error('Error removing AI filter:', error);
      toast.error('Failed to remove AI filter');

      // Revert optimistic update
      await loadAIFilters(accountId);

      throw error;
    }
  };

  // Helper function to validate if all labels in a filter exist for an account
  const validateLabelsExist = async (accountId: string, labels: string[]): Promise<boolean> => {
    if (labels.length === 0) return false;

    try {
      // This is a stub - you would need to implement the actual validation logic
      // based on how your application tracks labels for an account
      // const response = (await aiApi.validateLabels?.(labels)) || { valid: false };
      // return response.valid;
      return false;
    } catch (error) {
      console.error('Error validating labels:', error);
      return false;
    }
  };

  // Toggle filter active state with optimistic updates
  const toggleAIFilterActive = async (accountId: string, id: string) => {
    try {
      // Find the current filter
      const currentFilters = getFiltersForAccount(accountId);
      const currentFilter = currentFilters.find((filter) => filter.id === id);

      if (!currentFilter) {
        throw new Error('Filter not found');
      }

      // Don't allow activation if no output labels
      if (currentFilter.outputLabels.length === 0) {
        toast.error("Can't activate filter without output labels");
        return;
      }

      // Check if any of the labels don't exist for this account
      // const labelsValid = await validateLabelsExist(accountId, currentFilter.outputLabels);
      // if (!labelsValid) {
      //   toast.error("Can't activate filter with invalid labels");
      //   return;
      // }

      // Toggle the isActive property
      const newActiveState = !currentFilter.isActive;

      // Optimistically update the filter
      await updateAIFilter(accountId, id, { isActive: newActiveState });

      // toast.success(`AI Filter ${newActiveState ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error('Error toggling AI filter state:', error);
      toast.error('Failed to update AI filter');
      throw error;
    }
  };

  // Load all AI filters for all accounts
  const loadAllFilters = async () => {
    try {
      // Call API to get all filters
      const response = await aiApi.getAllAIFilters();

      // Map backend response to frontend model for each account
      const mappedFilters: Record<string, AIFilter[]> = {};

      Object.entries(response).forEach(([accountId, filters]) => {
        mappedFilters[accountId] = filters.map((filter) => ({
          id: filter.id,
          name: filter.name,
          prompt: filter.prompt,
          outputLabels: filter.outputLabels,
          markAsDone: filter.markAsDone,
          moveToTrash: filter.moveToTrash,
          isActive: filter.outputLabels.length === 0 ? false : filter.isActive
        }));
      });

      // Update the filters record with all accounts' filters
      setFiltersRecord(mappedFilters);
    } catch (error) {
      console.error('Error loading all AI filters:', error);
      throw error;
    }
  };

  return {
    getFiltersForAccount,
    isLoading: (accountId: string) => loadingRecord[accountId] || false,
    createAIFilter,
    updateAIFilter,
    createAIFiltersBatch,
    removeAIFilter,
    toggleAIFilterActive,
    loadAIFilters,
    loadAllFilters
  };
};
