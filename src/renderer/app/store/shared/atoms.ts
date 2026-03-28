// src/store/share/atoms.ts

import { atom } from 'jotai';

export interface OwnerShare {
  id: string;
  access: 'PRIVATE' | 'WORKSPACE' | 'PUBLIC';
  dataId: string;
  sharedDataType: 'MESSAGE' | 'THREAD';
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

// Atom to store owner shares by account ID
// Structure: { [accountId]: OwnerShare[] }
export const sharedByAccountAtom = atom<Record<string, OwnerShare[]>>({});

// Atom to track loading state for owner shares
export const sharedLoadingAtom = atom<Record<string, boolean>>({});
