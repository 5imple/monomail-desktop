import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoIconType } from '@/renderer/app/components/icons/icons';

export type CommandScope =
  | 'GLOBAL'
  | 'CONVERSATION_SELECTED'
  | 'SIDEBAR'
  | 'CONVERSATION_DISPLAY'
  | 'DIALOG';

// Simple thread command args
export interface ThreadCommandArgs {
  threadIds?: string[];
  advanceAfterAction?: boolean;
  /**
   * Done without its own toast or Undo entry; the undo is handed back here
   * instead. Archive-on-send uses it so the send's Undo brings both back.
   */
  onQuietUndo?: (undo: () => void) => void;
  /**
   * Close the reader (back to the list) instead of opening the next email.
   * Archive-on-send: after sending you land on the inbox; E / # still move on.
   */
  returnToList?: boolean;
  /**
   * With onQuietUndo: the server change waits for this (and is skipped if it
   * rejects); the archive shows locally at once. The handed-back undo is then
   * local-only, for use before this settles.
   */
  waitFor?: Promise<unknown>;
}

export interface MessageCommandArgs {
  message?: MonoMessage;
  accountId?: string;
}

// Modified MonoCommand interface to support proper generic types
export interface MonoCommand {
  scope: CommandScope;
  title: string;
  icon?: MonoIconType;
  hotkeys?: string[];
  // Fix: Make the action method use a more specific type signature
  action: (args?: any) => void | Promise<void> | 'page';
}

export interface ComposeCommandArgs {
  draft?: MonoDraft;
  accountId?: string;
}

export interface PinContactCommandArgs {
  pinContact?: string;
}
