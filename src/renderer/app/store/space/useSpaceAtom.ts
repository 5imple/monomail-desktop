import spaceApi from '@/main/api/space/spaceApi';
import { CreateSpaceRequest, UpdateSpaceRequest } from '@/main/api/space/types';
import { monoLocalStorageDb } from '@/renderer/app/lib/db/localStorage';
import { useContactAtom } from '@/renderer/app/store/contact/useContactAtom';
import {
  activeSpaceAtom,
  isLoadingSpacesAtom,
  mapApiSpaceToMonoSpace,
  MonoSpace,
  spacesAtom
} from '@/renderer/app/store/space/atom';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

// Cache key for spaces
const SPACES_CACHE_KEY = 'cache:space:spaces';
const ACTIVE_SPACE_ID_CACHE_KEY = 'cache:space:active_id';

// Utility function to get cached spaces from IndexedDB
export const getCachedSpaces = async (): Promise<MonoSpace[]> => {
  try {
    const cachedSpaces = await monoLocalStorageDb.getItem<MonoSpace[]>(SPACES_CACHE_KEY);
    return cachedSpaces || [];
  } catch (error) {
    console.warn('Failed to get cached spaces:', error);
    return [];
  }
};

// Utility function to get cached active space ID from IndexedDB
export const getCachedActiveSpaceId = async (): Promise<string | null> => {
  try {
    const cachedActiveSpaceId = await monoLocalStorageDb.getItem<string>(ACTIVE_SPACE_ID_CACHE_KEY);
    return cachedActiveSpaceId || null;
  } catch (error) {
    console.warn('Failed to get cached active space ID:', error);
    return null;
  }
};

// Removed synchronous version since localStorage is unreliable in Electron
// Use getCachedSpaces() async function instead

// Cache spaces to IndexedDB
const cacheSpaces = async (spaces: MonoSpace[]): Promise<void> => {
  try {
    await monoLocalStorageDb.setItem(SPACES_CACHE_KEY, spaces);
  } catch (error) {
    console.warn('Failed to cache spaces:', error);
  }
};

// Cache active space ID to IndexedDB
const cacheActiveSpaceId = async (activeSpaceId: string | null): Promise<void> => {
  try {
    if (activeSpaceId) {
      await monoLocalStorageDb.setItem(ACTIVE_SPACE_ID_CACHE_KEY, activeSpaceId);
    } else {
      await monoLocalStorageDb.removeItem(ACTIVE_SPACE_ID_CACHE_KEY);
    }
  } catch (error) {
    console.warn('Failed to cache active space ID:', error);
  }
};

// Clear all space-related cache (spaces and active space ID)
export const clearSpaceCache = async (): Promise<void> => {
  try {
    await Promise.all([
      monoLocalStorageDb.removeItem(SPACES_CACHE_KEY),
      monoLocalStorageDb.removeItem(ACTIVE_SPACE_ID_CACHE_KEY)
    ]);
  } catch (error) {
    console.warn('Failed to clear space cache:', error);
  }
};

// Atoms for state management

export function useSpaceAtom() {
  const [spaces, setSpaces] = useAtom(spacesAtom);

  const [activeSpace, setActiveSpace] = useAtom(activeSpaceAtom);
  const [isLoadingSpaces, setIsLoadingSpaces] = useAtom(isLoadingSpacesAtom);
  const { fetchContactsForSpace } = useContactAtom();

  // Load cached spaces when offline
  const loadCachedSpaces = useCallback(async (): Promise<boolean> => {
    try {
      const cachedSpaces = await getCachedSpaces();
      const cachedActiveSpaceId = await getCachedActiveSpaceId();

      if (cachedSpaces.length > 0) {
        setSpaces(cachedSpaces);
        if (cachedActiveSpaceId) {
          const foundSpace =
            cachedSpaces.find((space) => space.id === cachedActiveSpaceId) || cachedSpaces[0];
          setActiveSpace(foundSpace || null);
        } else if (cachedSpaces.length > 0) {
          // Set first space as active if no cached active space
          setActiveSpace(cachedSpaces[0]);
          await cacheActiveSpaceId(cachedSpaces[0].id);
        }

        // Immediately set loading to false since we have cached data
        setIsLoadingSpaces(false);

        return true;
      } else {
        console.log('No cached spaces found');
      }
    } catch (error) {
      console.warn('Failed to load cached spaces:', error);
    } finally {
      setIsLoadingSpaces(false);
    }
    return false;
  }, [setSpaces, setActiveSpace, setIsLoadingSpaces]);

  // Fetch all spaces from the server
  const loadSpaces = useCallback(
    async (activeSpaceId: string | null, accountUids?: string[]) => {
      try {
        // Fetch fresh data from server
        console.log('Fetching fresh spaces from server...');
        const spacesResponse = await spaceApi.fetchSpaces();

        if (!spacesResponse || !Array.isArray(spacesResponse)) {
          throw new Error('Invalid response from server');
        }

        const monoSpaces: MonoSpace[] = spacesResponse.map((space, index) => {
          const monoSpace = mapApiSpaceToMonoSpace(space);
          if (!accountUids?.length || index !== 0) return monoSpace;
          return {
            ...monoSpace,
            accountUids,
            activeAccountUids: accountUids
          };
        });

        // Update state with fresh data
        setSpaces(monoSpaces);
        // Cache the fresh data
        await cacheSpaces(monoSpaces);
        console.log('Updated spaces cache with fresh data');

        // If no spaces available, clear active space
        if (monoSpaces.length === 0) {
          console.log('No spaces available, clearing active space');
          setActiveSpace(null);
          await cacheActiveSpaceId(null);
          return;
        }

        // If activeSpaceId is provided, try to set that space as active
        if (activeSpaceId) {
          const requestedSpace = monoSpaces.find((space) => space.id === activeSpaceId);

          if (requestedSpace) {
            // Use functional update to get current activeSpace value
            setActiveSpace((currentActiveSpace) => {
              console.log('currentActiveSpace: ', currentActiveSpace);
              if (
                !currentActiveSpace ||
                currentActiveSpace.id !== requestedSpace.id ||
                accountUids?.length
              ) {
                console.log('Setting new active space:', requestedSpace.name);
                return requestedSpace;
              }
              return currentActiveSpace;
            });
            await cacheActiveSpaceId(requestedSpace.id);
            console.log('Set active space from activeSpaceId:', requestedSpace.name);
            return;
          }
        }

        // If no active space is set or the requested space wasn't found, set the default space as active
        setActiveSpace((currentActiveSpace) => {
          if (
            !currentActiveSpace ||
            !monoSpaces.find((space) => space.id === currentActiveSpace.id) ||
            accountUids?.length
          ) {
            const defaultSpace = monoSpaces[0];
            cacheActiveSpaceId(defaultSpace.id);
            console.log('Set default active space:', defaultSpace.name);
            return defaultSpace;
          }
          return currentActiveSpace;
        });

        console.log('Spaces fetched and cached successfully');
      } catch (error) {
        console.error('Failed to fetch spaces from server:', error);
        // Standalone Google mode: synthesise a local space from the provided account UIDs
        // so the thread list can resolve accounts without a backend.
        if (accountUids?.length) {
          const localSpace: MonoSpace = {
            id: 'local-space',
            name: 'Inbox',
            accountUids,
            activeAccountUids: accountUids
          };
          setSpaces([localSpace]);
          setActiveSpace(localSpace);
          await cacheSpaces([localSpace]);
          await cacheActiveSpaceId(localSpace.id);
          return;
        }
        // If we failed to fetch from server, try to load from cache
        setSpaces((currentSpaces) => {
          if (currentSpaces.length === 0) {
            console.log('No spaces in state, attempting to load from cache as fallback...');
            loadCachedSpaces();
          }
          return currentSpaces;
        });
      } finally {
        // Always set loading to false at the end
        setIsLoadingSpaces(false);
      }
    },
    [setActiveSpace, setSpaces, setIsLoadingSpaces, loadCachedSpaces]
  );

  // Create a new space
  const createSpace = useCallback(
    async (spaceData: MonoSpace) => {
      try {
        const createRequest: CreateSpaceRequest = {
          name: spaceData.name,
          color: spaceData.color || '#035ddf',
          icon: spaceData.icon || 'Home',
          accountUids: spaceData.accountUids
        };

        const newSpace = await spaceApi.createSpace(createRequest);

        if (!newSpace) {
          throw new Error('Failed to create space');
        }
        const newMonoSpace: MonoSpace = {
          id: newSpace.id,
          name: newSpace.name,
          icon: newSpace.icon,
          color: newSpace.color,
          accountUids: spaceData.accountUids || [],
          activeAccountUids: spaceData.activeAccountUids || [],
          pinnedEmails: newSpace.pinnedEmails || []
        };

        setSpaces((prev) => {
          const updatedSpaces = [...prev, newMonoSpace];
          // Cache updated spaces
          cacheSpaces(updatedSpaces).catch((error) => {
            console.warn('Failed to cache spaces after creation:', error);
          });
          return updatedSpaces;
        });

        return newMonoSpace;
      } catch (error) {
        console.error('Failed to create space:', error);
        throw error;
      }
    },
    [setSpaces]
  );

  // Update a space
  const updateSpace = useCallback(
    async (id: string, update: Partial<MonoSpace>) => {
      try {
        const updateRequest: UpdateSpaceRequest = {
          name: update.name,
          color: update.color,
          icon: update.icon
        };

        const updatedSpace = await spaceApi.updateSpace(id, updateRequest);

        if (!updatedSpace) {
          throw new Error('Failed to update space');
        }

        setSpaces((prevSpaces) => {
          const updatedSpaces = prevSpaces.map((space) =>
            space.id === id
              ? {
                  ...space,
                  ...mapApiSpaceToMonoSpace(updatedSpace),
                  accountUids: space.accountUids,
                  activeAccountUids: update.activeAccountUids || space.activeAccountUids
                }
              : space
          );
          // Cache updated spaces
          cacheSpaces(updatedSpaces).catch((error) => {
            console.warn('Failed to cache spaces after update:', error);
          });
          return updatedSpaces;
        });

        // Update active space if it's the one being modified
        if (activeSpace && activeSpace.id === id) {
          setActiveSpace((prev) => {
            if (!prev) return prev;
            const updatedActiveSpace = {
              ...prev,
              ...mapApiSpaceToMonoSpace(updatedSpace),
              accountUids: prev.accountUids,
              activeAccountUids: update.activeAccountUids || prev.activeAccountUids
            };
            return updatedActiveSpace;
          });
        }
      } catch (error) {
        console.error('Failed to update space:', error);
        throw error;
      }
    },
    [activeSpace, setSpaces, setActiveSpace]
  );

  // Delete a space
  const deleteSpace = useCallback(
    async (id: string) => {
      try {
        await spaceApi.deleteSpace(id);

        setSpaces((prev) => {
          const updatedSpaces = prev.filter((space) => space.id !== id);
          // Cache updated spaces
          cacheSpaces(updatedSpaces).catch((error) => {
            console.warn('Failed to cache spaces after deletion:', error);
          });
          return updatedSpaces;
        });

        // If the deleted space was active, switch to another space
        if (activeSpace && activeSpace.id === id) {
          const remainingSpaces = spaces.filter((s) => s.id !== id);
          if (remainingSpaces.length > 0) {
            const defaultSpace = remainingSpaces[0];
            setActiveSpace(defaultSpace);
            // Fetch contacts for the new active space
            // fetchContactsForSpace(defaultSpace.id);
          } else {
            // No spaces left, remove active space cache
            setActiveSpace(null);
          }
        }
      } catch (error) {
        console.error('Failed to delete space:', error);
        throw error;
      }
    },
    [spaces, activeSpace, setSpaces, setActiveSpace]
  );

  // Switch active space
  // Switch active space
  const switchSpace = useCallback(
    async (newid: string) => {
      const newSpace = spaces.find((s) => s.id === newid);
      if (!newSpace) return;

      const updatedActiveSpace = {
        ...newSpace,
        activeAccountUids: newSpace.accountUids // Reset active accounts to all in the space
      };

      setActiveSpace(updatedActiveSpace);

      await cacheActiveSpaceId(newid);

      // Fetch contacts for the new active space
      // fetchContactsForSpace(newid);
    },
    [spaces, setActiveSpace]
  );
  // Update active accounts within current space
  const setActiveAccountsInSpace = useCallback(
    async (accountUids: string[]) => {
      if (!activeSpace) return;

      setActiveSpace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activeAccountUids: accountUids
        };
      });
    },
    [activeSpace, setActiveSpace]
  );

  // Add account to space
  const updateAccountToSpace = useCallback(
    async (id: string, accountUids: string[]) => {
      try {
        await spaceApi.updateSpaceAccounts(id, { accountUids });

        // Update local state
        setSpaces((prevSpaces) => {
          const updatedSpaces = prevSpaces.map((space) =>
            space.id === id
              ? {
                  ...space,
                  accountUids: accountUids,
                  activeAccountUids: accountUids
                }
              : space
          );
          // Cache updated spaces
          cacheSpaces(updatedSpaces).catch((error) => {
            console.warn('Failed to cache spaces after account update:', error);
          });
          return updatedSpaces;
        });

        // Update active space if needed
        if (activeSpace && activeSpace.id === id) {
          setActiveSpace((prev) => {
            if (!prev) return prev;
            const updatedActiveSpace = {
              ...prev,
              accountUids: accountUids,
              activeAccountUids: accountUids
            };
            return updatedActiveSpace;
          });
          // Refresh contacts for the space after adding account
          // fetchContactsForSpace(id);
        }
      } catch (error) {
        console.error('Failed to add account to space:', error);
        throw error;
      }
    },
    [activeSpace, setSpaces, setActiveSpace]
  );

  return {
    spaces,
    activeSpace,
    isLoadingSpaces,
    loadSpaces,
    loadCachedSpaces,
    createSpace,
    updateSpace,
    deleteSpace,
    switchSpace,
    setActiveAccountsInSpace,
    updateAccountToSpace
  };
}
