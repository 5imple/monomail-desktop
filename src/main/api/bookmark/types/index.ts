export type SearchBookmark = {
  title: string;
  query: string;
  icon?: string;
  iconColor?: string;
  hotkey?: string;
};
export type SearchBookmarkResponse = {
  bookmarks: Record<string, SearchBookmark[]>;
};
