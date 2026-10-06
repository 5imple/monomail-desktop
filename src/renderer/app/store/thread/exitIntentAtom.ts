import { atom } from 'jotai';

/**
 * Why a thread is leaving the list, so its row can animate accordingly:
 * archived (Done) rows swipe right, trashed/spammed rows swipe left. Rows that
 * disappear for any other reason (filters, sync, view changes) just fade.
 *
 * Set by the thread label operations at the moment of the action; read by the
 * thread list's AnimatePresence `custom`, which reaches rows that are already
 * leaving and can no longer receive props.
 */
export type ThreadExitIntent = 'archive' | 'trash';

export const threadExitIntentAtom = atom<Record<string, ThreadExitIntent>>({});
