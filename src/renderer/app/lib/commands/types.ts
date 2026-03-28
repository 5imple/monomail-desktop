import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoIconType } from '@/renderer/app/components/icons/icons';
import { CommandType } from '@/renderer/app/types';

export type CommandOptions = {
  [key: string]: any;
};

export type CommandScope =
  | 'GLOBAL'
  | 'CONVERSATION_SELECTED'
  | 'SIDEBAR'
  | 'CONVERSATION_DISPLAY'
  | 'DIALOG';

// Simple thread command args
export interface ThreadCommandArgs {
  threadIds?: string[];
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
