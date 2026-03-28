import { SearchBookmark } from '@/main/api/bookmark/types';
import { atom } from 'jotai';

export const searchBookmarkAtom = atom<Record<string, SearchBookmark[]>>({});
