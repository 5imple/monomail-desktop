import { MonoThread } from '@/main/models/thread/MonoThread';
import type { SplitColor } from '@/renderer/app/lib/splitColors';
import { FilterCriteria } from '@/renderer/app/types';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Persistent atom for selected thread IDs (string[])
export const selectedThreadsAtom = atom<string[]>([]);
export const activeThreadIdAtom = atom<string | null>(null);
export const filteredThreadIdsAtom = atom<string[]>([]);
export const threadIdsAtom = atom<string[]>([]);
export const threadsMapAtom = atom<Record<string, MonoThread>>({});
/** The list has more conversations to load (the reader's "3 of 42+"). */
export const threadListHasMoreAtom = atom(false);

export const activeFiltersAtom = atomWithStorage<FilterCriteria[]>('global:filter:list', []);

/**
 * Custom labels: named filter tabs next to All / Unread / With attachments,
 * each a saved set of filter rules (lib/threadFilters). Kept on this device.
 */
export interface CustomLabel {
  id: string;
  name: string;
  rules: FilterCriteria[];
  /** Only show here: in the Inbox, its mail shows only under this tab. */
  hideFromInbox?: boolean;
  /** Its Split Inbox colour (lib/splitColors). */
  color?: SplitColor;
}

export const customLabelsAtom = atomWithStorage<CustomLabel[]>(
  'global:filter:customLabels',
  [],
  undefined,
  { getOnInit: true }
);

/**
 * The custom-label editor: closed, or open on a label (editing) or on
 * starting rules (new; e.g. "Save as label" from the current filters).
 */
export type CustomLabelEditorState =
  | { open: false }
  | { open: true; label?: CustomLabel; initialRules?: FilterCriteria[] };

export const customLabelEditorAtom = atom<CustomLabelEditorState>({ open: false });

/**
 * The filter tabs' order (ids of All / Unread / With attachments and of the
 * custom labels; see lib/filterTabOrder). Empty until a tab is moved.
 */
export const filterTabOrderAtom = atomWithStorage<string[]>(
  'global:filter:tabOrder',
  [],
  undefined,
  { getOnInit: true }
);
