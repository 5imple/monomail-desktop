import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useUndoManager } from '@/renderer/app/lib/commands/useUndoManager';
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useDraftAtom } from '@/renderer/app/store/draft/useDraftAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';
import { CommandType } from '@/renderer/app/types';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// Import separated command modules
import { MonoCommand } from './types';
import { useCommandHelpers } from './helpers';
import { createThreadCommands } from './threadCommands';
import { createComposeCommands } from './composeCommands';
import { createNavigationCommands } from './navigationCommands';
import { createPreferencesCommands } from './preferencesCommands';
import { createThemeCommands } from './themeCommands';

export const useCommands = (): Record<CommandType, MonoCommand> => {
  const { member, accounts, preference, updatePreference } = useAuth();
  const { searchNewQuery, globalSearchQuery } = useGlobalAtom();
  const { theme, setTheme } = useTheme();
  const { updateDraft } = useDraftAtom();
  const { activeSpace, spaces } = useSpaceAtom();
  // Payment-free build — getUserPlan no longer needed.
  const { openDialog, dialogState } = useDialogs();
  const {
    unmarkThreadAsSpam,
    markThreadAsDone,
    unmarkThreadAsDone,
    markThreadAsSpam,
    unmarkThreadsAsUnread,
    markThreadsAsUnread,
    markThreadAsStar,
    unmarkThreadAsStar,
    unmarkThreadAsTrash,
    markThreadAsTrash
  } = useThreadLabelAtom();
  const {
    threadsMap,
    filteredThreadIds,
    selectedThreads,
    setSelectedThreads,
    selectNextThread,
    selectPreviousThread
  } = useThreadAtom();
  const { setGlobalDraftWindows } = useComposeWindowAtom();
  const { trackEvent } = useUserTrackingData();
  const { t } = useTranslation();
  const { addUndoAction } = useUndoManager();

  // Use helper functions
  const { getAccountEmailById, groupThreadsByAccount } = useCommandHelpers(accounts, threadsMap);

  // Create command modules
  const threadCommands = createThreadCommands({
    t,
    globalSearchQuery,
    selectedThreads,
    filteredThreadIds,
    threadsMap,
    setSelectedThreads,
    selectNextThread,
    groupThreadsByAccount,
    addUndoAction,
    unmarkThreadAsSpam,
    markThreadAsDone,
    unmarkThreadAsDone,
    markThreadAsSpam,
    unmarkThreadsAsUnread,
    markThreadsAsUnread,
    markThreadAsStar,
    unmarkThreadAsStar,
    unmarkThreadAsTrash,
    markThreadAsTrash
  });

  const composeCommands = createComposeCommands({
    t,
    dialogState,
    getAccountEmailById,
    setGlobalDraftWindows,
    openDialog,
    globalSearchQuery
  });

  const navigationCommands = createNavigationCommands({
    t,
    dialogState,
    openDialog,
    searchNewQuery
  });

  const preferencesCommands = createPreferencesCommands({
    t,
    openDialog
  });

  const themeCommands = createThemeCommands({
    t,
    setTheme,
    updatePreference,
    preference
  });

  // Combine all commands
  const baseCommands: Record<CommandType, MonoCommand> = {
    ...threadCommands,
    ...composeCommands,
    ...navigationCommands,
    ...preferencesCommands,
    ...themeCommands
  } as Record<CommandType, MonoCommand>;

  const withTracking = useCallback(
    (commandId: CommandType, action: (args?: any) => void | Promise<void> | 'page') => {
      return (args?: any) => {
        trackEvent('command_executed', { command: commandId });
        return action(args);
      };
    },
    [trackEvent]
  );

  const trackedCommands = useMemo(() => {
    const result: Record<CommandType, MonoCommand> = {} as Record<CommandType, MonoCommand>;
    Object.keys(baseCommands).forEach((key) => {
      const cmd = baseCommands[key as CommandType];
      result[key as CommandType] = {
        ...cmd,
        action: withTracking(key as CommandType, cmd.action)
      };
    });
    return result;
  }, [baseCommands, withTracking]);

  return trackedCommands;
};
