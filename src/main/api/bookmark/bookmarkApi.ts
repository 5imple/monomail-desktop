import { apiClient } from '@/main/api/apiClient';
import { SearchBookmark, SearchBookmarkResponse } from '@/main/api/bookmark/types';

/**
 * Fetch bookmarks for a specific account.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<SearchBookmarkResponse>>} - The list of bookmarks.
 */
const fetchBookmarks = (signal?: AbortSignal) => {
  return apiClient.get<SearchBookmarkResponse>(`/mono/bookmarks`, {
    signal
  });
};

/**
 * Add a new bookmark for a specific account.
 * @param {SearchBookmark} bookmark - The bookmark data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the bookmark is successfully added.
 */
const addBookmark = (uid: string, bookmark: SearchBookmark, signal?: AbortSignal) => {
  return apiClient.post<void>(`/mono/bookmark`, bookmark, {
    uid,
    signal
  });
};

/**
 * Update an existing bookmark.
 * @param {string} query - The query of the bookmark to update.
 * @param {Partial<SearchBookmark>} updatedData - The updated bookmark data.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the bookmark is successfully updated.
 */
const updateBookmark = (
  uid: string,
  query: string,
  updatedData: Partial<SearchBookmark>,
  signal?: AbortSignal
) => {
  return apiClient.patch<void>(`/mono/bookmark?query=${query}`, updatedData, {
    uid,
    signal
  });
};

/**
 * Delete an existing bookmark.
 * @param {string} query - The query of the bookmark to delete.
 * @param {AbortSignal} [signal] - The abort signal to cancel the request.
 * @returns {Promise<void>} - Resolves when the bookmark is successfully deleted.
 */
const deleteBookmark = (uid: string, query: string, signal?: AbortSignal) => {
  return apiClient.delete<void>(`/mono/bookmark?query=${query}`, {
    uid,
    signal
  });
};

export default {
  fetchBookmarks,
  addBookmark,
  updateBookmark,
  deleteBookmark
};
