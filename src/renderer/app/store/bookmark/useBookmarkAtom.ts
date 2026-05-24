import { apiClient } from '@/main/api/apiClient';
import bookmarkApi from '@/main/api/bookmark/bookmarkApi';
import { SearchBookmark, SearchBookmarkResponse } from '@/main/api/bookmark/types';
import { searchBookmarkAtom } from '@/renderer/app/store/bookmark/atoms';
import { useAtom } from 'jotai';

export function useBookmarkAtom() {
  const [searchBookmarks, setSearchBookmark] =
    useAtom<Record<string, SearchBookmark[]>>(searchBookmarkAtom);

  /**
   * Fetch and set bookmarks for a specific UID.
   * @param {string} uid - The UID for the account.
   * @param {AbortSignal} [signal] - Optional abort signal to cancel the request.
   */
  const fetchAndSetBookmarks = async (signal?: AbortSignal) => {
    try {
      const response = await bookmarkApi.fetchBookmarks(signal);
      if (response) {
        const bookmarkResponse = response as SearchBookmarkResponse;
        setSearchBookmark(bookmarkResponse.bookmarks);
      }
    } catch (error) {
      console.error('Failed to fetch bookmarks:', error);
    }
  };

  /**
   * Add a bookmark for a specific UID, or update it if the same query exists.
   * @param {string} uid - The UID for the account.
   * @param {SearchBookmark} newBookmark - The new bookmark to add or update.
   * @param {AbortSignal} [signal] - Optional abort signal to cancel the request.
   */
  const addOrUpdateBookmark = async (
    uid: string,
    newBookmark: SearchBookmark,
    signal?: AbortSignal
  ) => {
    const existingBookmarks = searchBookmarks[uid] || [];
    const existingBookmarkIndex = existingBookmarks.findIndex(
      (bookmark) => bookmark.query === newBookmark.query
    );

    if (existingBookmarkIndex !== -1) {
      // Update if the bookmark with the same query exists
      bookmarkApi.updateBookmark(uid, newBookmark.query, newBookmark, signal);
      setSearchBookmark((prev) => ({
        ...prev,
        [uid]: prev[uid].map((bookmark, index) =>
          index === existingBookmarkIndex ? { ...bookmark, ...newBookmark } : bookmark
        )
      }));
    } else {
      // Add a new bookmark if it doesn't exist
      bookmarkApi.addBookmark(uid, newBookmark, signal);
      setSearchBookmark((prev) => ({
        ...prev,
        [uid]: [...(prev[uid] || []), newBookmark]
      }));
    }
  };

  /**
   * Update an existing bookmark for a specific UID.
   * @param {string} uid - The UID for the account.
   * @param {string} query - The query of the bookmark to update.
   * @param {Partial<SearchBookmark>} updatedData - The updated bookmark data.
   * @param {AbortSignal} [signal] - Optional abort signal to cancel the request.
   */
  const updateBookmark = async (
    uid: string,
    query: string,
    updatedData: Partial<SearchBookmark>,
    signal?: AbortSignal
  ) => {
    bookmarkApi.updateBookmark(uid, query, updatedData, signal);
    setSearchBookmark((prev) => ({
      ...prev,
      [uid]: (prev[uid] || []).map((bookmark) =>
        bookmark.query === query ? { ...bookmark, ...updatedData } : bookmark
      )
    }));
  };

  /**
   * Remove a bookmark for a specific UID.
   * @param {string} uid - The UID for the account.
   * @param {string} query - The query of the bookmark to delete.
   * @param {AbortSignal} [signal] - Optional abort signal to cancel the request.
   */
  const removeBookmark = async (uid: string, query: string, signal?: AbortSignal) => {
    bookmarkApi.deleteBookmark(uid, query, signal);
    setSearchBookmark((prev) => ({
      ...prev,
      [uid]: (prev[uid] || []).filter((bookmark) => bookmark.query !== query)
    }));
  };

  /**
   * Set the bookmarks array for a specific UID directly.
   * @param {string} uid - The UID for the account.
   * @param {SearchBookmark[]} bookmarks - The new bookmarks array to set.
   */
  const setBookmarks = (uid: string, bookmarks: SearchBookmark[]) => {
    setSearchBookmark((prev) => ({
      ...prev,
      [uid]: bookmarks
    }));
  };

  return {
    searchBookmarks,
    fetchAndSetBookmarks,
    addOrUpdateBookmark,
    updateBookmark,
    removeBookmark,
    setBookmarks
  };
}
