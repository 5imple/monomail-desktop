import { atom } from 'jotai';

/**
 * Unread conversations in the Inbox across the active space, counted from the
 * whole local cache by the sidebar (its Inbox row's badge). null until
 * counted, or when the sidebar has no Inbox row. The titlebar's Inbox tab
 * shows the same number, so the two badges agree; it used to count only the
 * conversations loaded into memory (a page or two of the list).
 */
export const inboxUnreadCountAtom = atom<number | null>(null);
