import { CommandType } from '@/renderer/app/types';
import electronApi from '@/renderer/app/lib/electronApi';
import { MonoCommand } from './types';

interface NavigationCommandDependencies {
  t: (key: string, options?: any) => string;
  dialogState: any;
  openDialog: (dialog: any, options?: any) => void;
  searchNewQuery: (query: string, threadIds?: string[], addToHistory?: boolean) => void;
  openLater: () => void;
}

export const createNavigationCommands = (
  deps: NavigationCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const { t, dialogState, openDialog, searchNewQuery, openLater } = deps;

  return {
    SEARCH: {
      scope: 'GLOBAL',
      title: t('command.search'),
      icon: 'Search',
      // / as in Superhuman and Gmail (matched by key code: "/" itself
      // would also match ⌘/ under react-hotkeys-hook's useKey).
      hotkeys: ['SLASH', 'MOD+F'],
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['SEARCH'] });
        return;
      }
    },

    SPACE: {
      scope: 'GLOBAL',
      title: t('command.space'),
      icon: 'Planet',
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['SPACE'] });
        return;
      }
    },

    // Snooze / Label / Move act on the open conversation or the selected rows
    // (CONVERSATION_SELECTED covers both), so H / L / M work from the list the
    // way E and S do, not only while reading.
    REMINDER: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.reminder'),
      icon: 'Clock',
      // ⌘H / ⌘M were listed too, but macOS takes them (Hide, Minimize).
      hotkeys: ['H'],
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['REMINDER'] });
        return;
      }
    },

    LABEL: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.label'),
      icon: 'Label',
      hotkeys: ['L', 'MOD+L'],
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['LABEL'] });
        return;
      }
    },

    MOVE: {
      scope: 'CONVERSATION_SELECTED',
      title: t('command.move'),
      icon: 'ArrowRight',
      hotkeys: ['V', 'M'],
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['MOVE'] });
        return;
      }
    },

    // G then I is "go to Inbox" in every mail client; it used to open
    // is:important while the titlebar's Inbox tab had no shortcut at all.
    // Same query as the Inbox tab and the sidebar's Inbox row.
    GOTO_INBOX: {
      scope: 'GLOBAL',
      title: t('command.goto_inbox'),
      // A sequence (press G, then I), as the UI draws it; "G+I" meant both
      // keys held together.
      hotkeys: ['G>I'],
      icon: 'Inbox',
      action: (_: any) => {
        searchNewQuery('category:primary', undefined, false);
      }
    },

    GOTO_DONE: {
      scope: 'GLOBAL',
      title: t('command.goto_done'),
      hotkeys: ['G>E'],
      icon: 'CheckCircle',
      action: (_: any) => {
        searchNewQuery('NOT in:inbox', undefined, false);
      }
    },

    GOTO_STARRED: {
      scope: 'GLOBAL',
      title: t('command.goto_starred'),
      hotkeys: ['G>S'],
      icon: 'Star',
      action: (_: any) => {
        searchNewQuery('is:starred', undefined, false);
      }
    },

    GOTO_SENT: {
      scope: 'GLOBAL',
      title: t('command.goto_sent'),
      hotkeys: ['G>T'],
      icon: 'SendHorizontal',
      action: (_: any) => {
        searchNewQuery('in:sent', undefined, false);
      }
    },

    GOTO_DRAFTS: {
      scope: 'GLOBAL',
      title: t('command.goto_drafts'),
      hotkeys: ['G>D'],
      icon: 'FileText',
      action: (_: any) => {
        searchNewQuery('in:draft', undefined, false);
      }
    },

    // Snoozed and scheduled mail (the Later tab): G then L.
    GOTO_LATER: {
      scope: 'GLOBAL',
      title: t('command.goto_later', { defaultValue: 'Go to Later' }),
      hotkeys: ['G>L'],
      icon: 'Clock',
      action: (_: any) => {
        openLater();
      }
    },

    OPEN_LOG_FOLDER: {
      scope: 'GLOBAL',
      title: t('command.open_log_folder'),
      icon: 'Command',
      action: (_: any) => {
        electronApi.openLogFolder();
      }
    }
  };
};
