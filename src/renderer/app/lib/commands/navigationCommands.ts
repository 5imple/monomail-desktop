import { CommandType } from '@/renderer/app/types';
import electronApi from '@/renderer/app/lib/electronApi';
import { MonoCommand } from './types';

interface NavigationCommandDependencies {
  t: (key: string, options?: any) => string;
  dialogState: any;
  openDialog: (dialog: any, options?: any) => void;
  searchNewQuery: (query: string, threadIds?: string[], addToHistory?: boolean) => void;
}

export const createNavigationCommands = (
  deps: NavigationCommandDependencies
): Partial<Record<CommandType, MonoCommand>> => {
  const { t, dialogState, openDialog, searchNewQuery } = deps;

  return {
    SEARCH: {
      scope: 'GLOBAL',
      title: t('command.search'),
      icon: 'Search',
      hotkeys: ['MOD+F'],
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

    REMINDER: {
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.reminder'),
      icon: 'Clock',
      hotkeys: ['H', 'MOD+H'],
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['REMINDER'] });
        return;
      }
    },

    LABEL: {
      scope: 'CONVERSATION_DISPLAY',
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
      scope: 'CONVERSATION_DISPLAY',
      title: t('command.move'),
      icon: 'ArrowRight',
      hotkeys: ['V', 'M', 'MOD+M'],
      action: () => {
        if (dialogState.commandPalette.open) return 'page';
        openDialog('commandPalette', { pages: ['MOVE'] });
        return;
      }
    },

    GOTO_IMPORTANT: {
      scope: 'GLOBAL',
      title: t('command.goto_important'),
      hotkeys: ['G+I', 'MOD+G+I'],
      icon: 'Inbox',
      action: (_: any) => {
        searchNewQuery('is:important', undefined, false);
      }
    },

    GOTO_DONE: {
      scope: 'GLOBAL',
      title: t('command.goto_done'),
      hotkeys: ['G+E', 'MOD+G+E'],
      icon: 'CheckCircle',
      action: (_: any) => {
        searchNewQuery('NOT in:inbox', undefined, false);
      }
    },

    GOTO_STARRED: {
      scope: 'GLOBAL',
      title: t('command.goto_starred'),
      hotkeys: ['G+S', 'MOD+G+S'],
      icon: 'Star',
      action: (_: any) => {
        searchNewQuery('is:starred', undefined, false);
      }
    },

    GOTO_SENT: {
      scope: 'GLOBAL',
      title: t('command.goto_sent'),
      hotkeys: ['G+T', 'MOD+G+T'],
      icon: 'SendHorizontal',
      action: (_: any) => {
        searchNewQuery('in:sent', undefined, false);
      }
    },

    GOTO_DRAFTS: {
      scope: 'GLOBAL',
      title: t('command.goto_drafts'),
      hotkeys: ['G+D', 'MOD+G+D'],
      icon: 'FileText',
      action: (_: any) => {
        searchNewQuery('in:draft', undefined, false);
      }
    },

    OPEN_LOG_FOLDER: {
      scope: 'GLOBAL',
      title: t('command.open_log_folder'),
      icon: 'Command',
      action: (_: any) => {
        electronApi.openLogFolder();
      }
    },

    OPEN_FEEDBACK: {
      scope: 'GLOBAL',
      title: t('command.open_feedback'),
      hotkeys: ['G+F', 'MOD+G+F'],
      icon: 'ChatBubble',
      action: (_: any) => {
        openDialog('feedback');
      }
    }
  };
};
