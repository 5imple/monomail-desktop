import { MonoThread } from '@/main/models/thread/MonoThread';
import { FilterCriteria } from '@/renderer/app/types';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Persistent atom for selected thread IDs (string[])
export const selectedThreadsAtom = atom<string[]>([]);
export const activeThreadIdAtom = atom<string | null>(null);
export const filteredThreadIdsAtom = atom<string[]>([]);
export const threadIdsAtom = atom<string[]>([]);
export const threadsMapAtom = atom<Record<string, MonoThread>>({});

export const isThreadFilteredAtom = atomWithStorage<boolean>('global:filter:active', false);
export const activeFiltersAtom = atomWithStorage<FilterCriteria[]>('global:filter:list', []);
