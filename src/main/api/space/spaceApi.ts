import { apiClient, isBackendConfigured } from '@/main/api/apiClient';
import {
  AddPinRequest,
  CreateSpaceRequest,
  MonoSpaceResponse,
  PinResponse,
  SpaceContactsResponse,
  UpdateSpaceAccountsRequest,
  UpdateSpaceRequest,
  CustomSidebarResponse,
  UpdateCustomSidebarRequest,
  AddCustomSidebarItemRequest,
  CreateCustomSidebarFolderRequest,
  ReorderCustomSidebarRequest,
  MoveCustomSidebarItemRequest,
  CustomNavItem
} from '@/main/api/space/types';
import {
  networkFirstCache,
  CACHE_KEYS,
  CACHE_TTL
} from '@/renderer/app/lib/cache/networkFirstCache';

/**
 * Fetch all spaces.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoSpaceResponse[]>} - The list of spaces.
 */
const fetchSpaces = (signal?: AbortSignal) => {
  // Standalone: spaces are a backend-only feature (hidden in the standalone build).
  if (!isBackendConfigured()) return Promise.resolve<MonoSpaceResponse[]>([]);
  return apiClient.get<MonoSpaceResponse[]>('/mono/spaces', { signal });
};

/**
 * Fetch a specific space by its UID.
 * @param {string} id - The UID of the space to fetch.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoSpaceResponse>} - The space data.
 */
const fetchSpace = (id: string, signal?: AbortSignal) => {
  return apiClient.get<MonoSpaceResponse>(`/mono/spaces/${id}`, {
    signal
  });
};

/**
 * Fetch the default space.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoSpaceResponse>} - The default space data.
 */
const fetchDefaultSpace = (signal?: AbortSignal) => {
  if (!isBackendConfigured())
    return Promise.resolve<MonoSpaceResponse>({
      // Stable non-empty id so callers that key/compare on it don't choke on '' .
      id: 'local-default',
      name: 'Default',
      color: '',
      icon: '',
      createdAt: '',
      updatedAt: '',
      pinnedEmails: [],
      accountUids: [],
      default: true
    });
  return apiClient.get<MonoSpaceResponse>('/mono/spaces/default', {
    signal
  });
};

/**
 * Create a new space.
 * @param {CreateSpaceRequest} spaceData - The space data to create.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoSpaceResponse>} - The created space data.
 */
const createSpace = (spaceData: CreateSpaceRequest, signal?: AbortSignal) => {
  return apiClient.post<MonoSpaceResponse>('/mono/spaces', spaceData, {
    signal
  });
};

/**
 * Update an existing space.
 * @param {string} id - The UID of the space to update.
 * @param {UpdateSpaceRequest} updateData - The updated space data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<MonoSpaceResponse>} - The updated space data.
 */
const updateSpace = (id: string, updateData: UpdateSpaceRequest, signal?: AbortSignal) => {
  return apiClient.patch<MonoSpaceResponse>(`/mono/spaces/${id}`, updateData, {
    signal
  });
};

/**
 * Delete a space.
 * @param {string} id - The UID of the space to delete.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the space is successfully deleted.
 */
const deleteSpace = (id: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/mono/spaces/${id}`, {
    signal
  });
};

/**
 * Add an account to a space.
 * @param {string} id - The UID of the space.
 * @param {UpdateSpaceAccountsRequest} accountData - The account data to add.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the account is successfully added.
 */
const updateSpaceAccounts = (
  id: string,
  accountData: UpdateSpaceAccountsRequest,
  signal?: AbortSignal
) => {
  return apiClient.put<void>(`/mono/spaces/${id}/accounts`, accountData, {
    signal
  });
};

/**
 * Remove an account from a space.
 * @param {string} id - The UID of the space.
 * @param {string} accountUid - The UID of the account to remove.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the account is successfully removed.
 */
const removeAccountFromSpace = (id: string, accountUid: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/mono/spaces/${id}/accounts/${accountUid}`, {
    signal
  });
};

/**
 * Fetch pins for a specific space.
 * @param {string} id - The UID of the space.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<PinResponse>} - The pins data for the space.
 */
const fetchSpacePins = (id: string, signal?: AbortSignal) => {
  return apiClient.get<PinResponse>(`/mono/spaces/${id}/pins`, {
    signal
  });
};

/**
 * Add a pin to a space.
 * @param {string} id - The UID of the space.
 * @param {AddPinRequest} pinData - The pin data to add.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the pin is successfully added.
 */
const addPinToSpace = (id: string, pinData: AddPinRequest, signal?: AbortSignal) => {
  return apiClient.post<void>(`/mono/spaces/${id}/pins`, pinData, {
    signal
  });
};

/**
 * Update the order of pins in a space.
 * @param {string} id - The UID of the space.
 * @param {string[]} pinnedEmails - The ordered list of pinned email addresses.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the pin order is successfully updated.
 */
const updatePinOrder = (id: string, pinnedEmails: string[], signal?: AbortSignal) => {
  return apiClient.patch<void>(`/mono/spaces/${id}/pins/order`, pinnedEmails, {
    signal
  });
};
const removePinFromSpace = (id: string, pinnedEmail: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/mono/spaces/${id}/pins/${pinnedEmail}`, {
    signal
  });
};

const fetchSpaceContacts = (id: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    spaceId: id
  });
  return apiClient.get<SpaceContactsResponse>(`/mono/contact/space?${params.toString()}`, {
    signal
  });
};

// Custom Sidebar API functions

/**
 * Fetch custom sidebar configuration for a specific space.
 * @param {string} spaceId - The ID of the space.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The custom sidebar configuration.
 */
const fetchCustomSidebar = (spaceId: string, signal?: AbortSignal) => {
  // Standalone: no server-side custom sidebar — return an empty config.
  if (!isBackendConfigured())
    return Promise.resolve<CustomSidebarResponse>({
      id: '',
      spaceId,
      sidebarState: { items: {}, order: [] },
      createdAt: '',
      updatedAt: ''
    });
  return apiClient.get<CustomSidebarResponse>(`/mono/sidebar/spaces/${spaceId}`, {
    signal
  });
};

/**
 * Update custom sidebar configuration for a specific space.
 * @param {string} spaceId - The ID of the space.
 * @param {UpdateCustomSidebarRequest} sidebarData - The sidebar configuration to update.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const updateCustomSidebar = (
  spaceId: string,
  sidebarData: UpdateCustomSidebarRequest,
  signal?: AbortSignal
) => {
  return apiClient.put<CustomSidebarResponse>(`/mono/sidebar/spaces/${spaceId}`, sidebarData, {
    signal
  });
};

/**
 * Add a navigation item to the custom sidebar.
 * @param {string} spaceId - The ID of the space.
 * @param {AddCustomSidebarItemRequest} itemData - The navigation item to add.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const addCustomSidebarItem = (
  spaceId: string,
  itemData: AddCustomSidebarItemRequest,
  signal?: AbortSignal
) => {
  return apiClient.post<CustomSidebarResponse>(`/mono/sidebar/spaces/${spaceId}/items`, itemData, {
    signal
  });
};

/**
 * Create a folder in the custom sidebar.
 * @param {string} spaceId - The ID of the space.
 * @param {CreateCustomSidebarFolderRequest} folderData - The folder data to create.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const createCustomSidebarFolder = (
  spaceId: string,
  folderData: CreateCustomSidebarFolderRequest,
  signal?: AbortSignal
) => {
  return apiClient.post<CustomSidebarResponse>(
    `/mono/sidebar/spaces/${spaceId}/folders`,
    folderData,
    {
      signal
    }
  );
};

/**
 * Reorder navigation items in the custom sidebar.
 * @param {string} spaceId - The ID of the space.
 * @param {ReorderCustomSidebarRequest} orderData - The new order of navigation items.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const reorderCustomSidebarItems = (
  spaceId: string,
  orderData: ReorderCustomSidebarRequest,
  signal?: AbortSignal
) => {
  return apiClient.patch<CustomSidebarResponse>(
    `/mono/sidebar/spaces/${spaceId}/reorder`,
    orderData,
    {
      signal
    }
  );
};

/**
 * Move a navigation item to a folder or to root level.
 * @param {string} spaceId - The ID of the space.
 * @param {MoveCustomSidebarItemRequest} moveData - The move operation data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const moveCustomSidebarItem = (
  spaceId: string,
  moveData: MoveCustomSidebarItemRequest,
  signal?: AbortSignal
) => {
  return apiClient.patch<CustomSidebarResponse>(`/mono/sidebar/spaces/${spaceId}/move`, moveData, {
    signal
  });
};

/**
 * Toggle folder collapsed/expanded state.
 * @param {string} spaceId - The ID of the space.
 * @param {string} folderId - The ID of the folder to toggle.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const toggleCustomSidebarFolder = (spaceId: string, folderId: string, signal?: AbortSignal) => {
  return apiClient.patch<CustomSidebarResponse>(
    `/mono/sidebar/spaces/${spaceId}/folders/${folderId}/toggle`,
    {},
    {
      signal
    }
  );
};

/**
 * Get available navigation items that can be added to the sidebar.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomNavItem[]>} - The list of available navigation items.
 */
const getAvailableCustomSidebarItems = (signal?: AbortSignal) => {
  return apiClient.get<CustomNavItem[]>('/mono/sidebar/available-items', {
    signal
  });
};

/**
 * Delete a navigation item from the custom sidebar.
 * @param {string} spaceId - The ID of the space.
 * @param {string} itemId - The ID of the item to delete.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<CustomSidebarResponse>} - The updated sidebar configuration.
 */
const deleteCustomSidebarItem = (spaceId: string, itemId: string, signal?: AbortSignal) => {
  return apiClient.delete<CustomSidebarResponse>(
    `/mono/sidebar/spaces/${spaceId}/items/${itemId}`,
    {
      signal
    }
  );
};

export default {
  fetchSpaces,
  fetchSpace,
  fetchDefaultSpace,
  createSpace,
  updateSpace,
  deleteSpace,
  updateSpaceAccounts,
  removeAccountFromSpace,
  fetchSpacePins,
  addPinToSpace,
  updatePinOrder,
  removePinFromSpace,
  fetchSpaceContacts,
  // Custom Sidebar APIs
  fetchCustomSidebar,
  updateCustomSidebar,
  addCustomSidebarItem,
  createCustomSidebarFolder,
  reorderCustomSidebarItems,
  moveCustomSidebarItem,
  toggleCustomSidebarFolder,
  getAvailableCustomSidebarItems,
  deleteCustomSidebarItem
};
