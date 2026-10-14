import { Contact } from '@/renderer/app/lib/db/contact';
import { atom } from 'jotai';

export const contactArrayAtom = atom<Contact[]>([]);

export const selectedContactAtoms = atom<Contact[]>([]);
