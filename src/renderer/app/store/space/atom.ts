import { MonoSpaceResponse } from '@/main/api/space/types';
import { atom } from 'jotai';

export interface MonoSpace {
  id: string;
  accountUids: string[];
  activeAccountUids: string[]; // Track multiple active accounts inside the space
  name: string;
  icon?: string;
  color?: string;
  pinnedEmails?: string[];
}
export const spacesAtom = atom<MonoSpace[]>([]);
export const activeSpaceAtom = atom<MonoSpace | null>(null);
export const isLoadingSpacesAtom = atom<boolean>(true);

export const mapApiSpaceToMonoSpace = (apiSpace: MonoSpaceResponse): MonoSpace => {
  return {
    id: apiSpace.id,
    name: apiSpace.name,
    icon: apiSpace.icon,
    color: apiSpace.color,
    accountUids: apiSpace.accountUids, // Will be populated separately through a different API call
    activeAccountUids: apiSpace.accountUids, // Will be set after loading
    pinnedEmails: apiSpace.pinnedEmails || []
  };
};
