import { generateUUID } from '@/main/utils';
import type { UndoableAction } from '@/renderer/app/lib/commands/useUndoManager';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

interface UndoableActionOptions {
  /** Starts the action: the change on screen and on the server. */
  perform: () => Promise<unknown>;
  /** Reverses it. `performed` settles once the action is through, so the
   *  reverse change can wait for it on the server. */
  undo: (performed: Promise<unknown>) => unknown;
  message: string;
  errorMessage: string;
  undoLabel: ReactNode;
  addUndoAction: (action: UndoableAction) => void;
  removeUndoAction: (toastId: string | number) => void;
}

/**
 * Runs a thread action behind a toast whose Undo (its button, and Z) works from
 * the moment the toast appears, for as long as it shows. The change is on
 * screen already, so the toast confirms at once rather than after the server:
 * a Microsoft move takes a second or two, and until then Undo did nothing.
 * If the server refuses, the toast turns into the error, with no Undo.
 */
/** How long an action's Undo toast (and so its Undo / Z) stays. */
export const UNDO_TOAST_MS = 6000;

export function runUndoableAction({
  perform,
  undo,
  message,
  errorMessage,
  undoLabel,
  addUndoAction,
  removeUndoAction
}: UndoableActionOptions): void {
  const toastId = generateUUID();
  // 'failed': refused by the server and rolled back, so nothing to undo.
  let state: 'live' | 'undone' | 'failed' = 'live';
  const performed = perform();

  const runUndo = async () => {
    if (state !== 'live') return;
    state = 'undone';
    removeUndoAction(toastId);
    toast.dismiss(toastId);
    try {
      await undo(performed);
    } catch (error) {
      console.error('Undo failed:', error);
    }
  };

  toast.success(message, {
    id: toastId,
    action: { label: undoLabel, onClick: () => runUndo() },
    // Long enough to reach for Z (sonner's default is 4 s). No countdown bar:
    // the user asked for the plain line.
    duration: UNDO_TOAST_MS
  });
  addUndoAction({ execute: runUndo, timestamp: Date.now(), toastId });

  performed.catch((error) => {
    console.error('Thread action failed:', error);
    if (state !== 'live') return;
    state = 'failed';
    removeUndoAction(toastId);
    toast.error(errorMessage, { id: toastId, action: undefined });
  });
}
