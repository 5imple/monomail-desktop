import { Contact } from '@/renderer/app/lib/db/contact';
import { createIndexedDBStorage } from '@/renderer/app/lib/db/jotai-idb';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const contactArrayAtom = atom<Contact[]>([]);

export const selectedContactAtoms = atom<Contact[]>([]);
export const lastGoogleContactSyncDateAtom = atomWithStorage<Record<string, string>>(
  'lgc-sync',
  {},
  createIndexedDBStorage<Record<string, string>>({ defaultValue: {} })
);
