import { MonoDraft } from '@/main/models/draft/MonoDraft';
import { CommandType } from '@/renderer/app/types';
import {
  MonoCommand,
  MessageCommandArgs,
  ComposeCommandArgs,
  PinContactCommandArgs
} from './types';

interface ComposeCommandDependencies {
  t: (key: string, options?: any) => string;
  dialogState: any;
  getAccountEmailById: (accountId?: string) => string;
  setGlobalDraftWindows: (drafts: MonoDraft[]) => void;
  openDialog: (dialog: any, options?: any) => void;
  globalSearchQuery: string;
}

export const createComposeCommands = (
  deps: ComposeCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const {
    t,
    dialogState,
    getAccountEmailById,
    setGlobalDraftWindows,
    openDialog,
    globalSearchQuery
  } = deps;

  return {
    PIN_CONTACT: {
      scope: 'GLOBAL',
      title: t('command.pin_contact'),
      icon: 'UserPlus',
      hotkeys: ['MOD+E', 'MOD+CTRL+E'],
      action: (args?: PinContactCommandArgs) => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', {
          pages: ['PIN_CONTACT'],
          pinContact: args?.pinContact ?? ''
        });
        return;
      }
    },

    COMPOSE_NEW_MESSAGE: {
      scope: 'GLOBAL',
      title: t('command.compose_new_message'),
      icon: 'Edit',
      hotkeys: ['C', 'MOD+N'],
      action: (args?: ComposeCommandArgs) => {
        const accountEmail = getAccountEmailById(args?.draft?.from);
        if (!accountEmail) return;

        const draft = args?.draft ?? new MonoDraft({ from: accountEmail });
        setGlobalDraftWindows([draft]);
      }
    },

    COMPOSE_REPLY_MESSAGE: {
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.compose_reply_message'),
      hotkeys: ['R'],
      icon: 'Reply',
      action: (args?: MessageCommandArgs) => {
        const item = args?.message;
        if (!item) return;

        // Use the message's accountId if available
        const accountId = args?.accountId;
        const accountEmail = getAccountEmailById(accountId);

        if (!accountEmail) return;

        const draft = new MonoDraft({
          from: accountEmail,
          messageId: item.id,
          threadId: item.threadId,
          to: [item.from.email],
          cc: item.cc.map((recipient) => recipient.email),
          bcc: item.bcc.map((recipient) => recipient.email),
          subject: item.subject.toLowerCase().startsWith('re: ')
            ? item.subject
            : `Re: ${item.subject}`
        });
        setGlobalDraftWindows([draft]);
      }
    },

    COMPOSE_FORWARD_MESSAGE: {
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.compose_forward_message'),
      hotkeys: ['F'],
      icon: 'Forward',
      action: (args?: MessageCommandArgs) => {
        const item = args?.message;
        if (!item) return;

        // Use the message's accountId if available
        const accountId = args?.accountId;
        const accountEmail = getAccountEmailById(accountId);
        if (!accountEmail) return;

        const draft = new MonoDraft({
          from: accountEmail,
          messageId: item.id,
          threadId: item.threadId,
          subject: item.subject.toLowerCase().startsWith('fwd: ')
            ? item.subject
            : `Fwd: ${item.subject}`
        });
        setGlobalDraftWindows([draft]);
      }
    },

    DISCARD_DRAFT: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.discard_draft'),
      icon: 'Trash',
      action: () => {
        // TODO
      }
    },

    // Sidebar commands
    SIDEBAR_FAVORITE_ADD: {
      scope: 'SIDEBAR',
      title: t('command.sidebar_favorite_add'),
      hotkeys: ['MOD+CTRL+D', 'MOD+D'],
      icon: 'Plus',
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', {
          pages: ['SEARCH', 'BOOKMARK_NAME'],
          searchQuery: globalSearchQuery,
          aiSearchMode: false
        });
        return;
      }
    }
  };
};
