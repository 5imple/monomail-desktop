import { localDataStore } from '@/renderer/app/lib/localDataStore';
import { SearchBookmark, SearchBookmarkResponse } from '@/main/api/bookmark/types';

// Standalone: saved-search bookmarks live in local storage, keyed by account uid.
const LS_KEY = 'bookmarks';

const readAll = (): Record<string, SearchBookmark[]> =>
  localDataStore.get<Record<string, SearchBookmark[]>>(LS_KEY) ?? {};

/**
 * Fetch all bookmarks grouped by account uid.
 */
const fetchBookmarks = async (_signal?: AbortSignal): Promise<SearchBookmarkResponse> => {
  return { bookmarks: readAll() };
};

/**
 * Add (or replace, de-duped by query) a bookmark for an account.
 */
const addBookmark = async (
  uid: string,
  bookmark: SearchBookmark,
  _signal?: AbortSignal
): Promise<void> => {
  const all = readAll();
  const list = all[uid] ?? [];
  const next = [...list.filter((b) => b.query !== bookmark.query), bookmark];
  localDataStore.set(LS_KEY, { ...all, [uid]: next });
};

/**
 * Update an existing bookmark (matched by query) for an account.
 */
const updateBookmark = async (
  uid: string,
  query: string,
  updatedData: Partial<SearchBookmark>,
  _signal?: AbortSignal
): Promise<void> => {
  const all = readAll();
  const list = all[uid] ?? [];
  localDataStore.set(LS_KEY, {
    ...all,
    [uid]: list.map((b) => (b.query === query ? { ...b, ...updatedData } : b))
  });
};

/**
 * Delete a bookmark (matched by query) for an account.
 */
const deleteBookmark = async (uid: string, query: string, _signal?: AbortSignal): Promise<void> => {
  const all = readAll();
  const list = all[uid] ?? [];
  localDataStore.set(LS_KEY, { ...all, [uid]: list.filter((b) => b.query !== query) });
};

export default {
  fetchBookmarks,
  addBookmark,
  updateBookmark,
  deleteBookmark
};
