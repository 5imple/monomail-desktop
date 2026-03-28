// src/store/draft/atoms.ts

import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { atom } from 'jotai';

// Updated to match the server response structure: {"drafts":{"55f023e6-7880-43a9-a39b-c79c52d393d7":[]}}
// First level keys are account IDs, second level keys are draft IDs
export const draftsMapByAccountAtom = atom<Record<string, Record<string, MonoDraft>>>({});

// Two-level structure: account ID -> thread ID -> array of drafts
export const draftByThreadAtom = atom<Record<string, Record<string, MonoDraft[]>>>({});

// Queue of drafts being sent
export const sendDraftQueueAtom = atom<string[]>([]);
