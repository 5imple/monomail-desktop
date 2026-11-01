import { useCommands } from '@/renderer/app/lib/commands/useCommands';
import { MonoCommand } from '@/renderer/app/lib/commands/types';
import { CommandType } from '@/renderer/app/types';
import React, { createContext, useCallback, useContext, useRef } from 'react';

export type RunCommand = (commandId: CommandType, args?: any) => Promise<void | 'page'>;

const CommandRunnerContext = createContext<RunCommand | null>(null);
CommandRunnerContext.displayName = 'CommandRunnerContext';
const CommandTableContext = createContext<Record<CommandType, MonoCommand> | null>(null);
CommandTableContext.displayName = 'CommandTableContext';

/**
 * Builds the command table once for the whole app. The table is made from a
 * dozen stores (every thread, the selection, drafts, dialogs…), so each
 * component that built it re-rendered on any change to any of them: the
 * layout, every message card, the compose card. Components now get a runner
 * whose identity never changes and which always runs the latest table; only
 * this provider (and the few that list commands, via useCommandTable)
 * re-renders when the stores change. Its children are created by its parent,
 * so its own re-renders do not cascade into them.
 */
export const CommandRunnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const commands = useCommands();
  const latest = useRef(commands);
  latest.current = commands;
  const run = useCallback<RunCommand>(async (commandId, args) => {
    const command = latest.current[commandId];
    if (!command) throw new Error(`Command with ID ${commandId} not found`);
    return command.action(args);
  }, []);
  return (
    <CommandRunnerContext.Provider value={run}>
      <CommandTableContext.Provider value={commands}>{children}</CommandTableContext.Provider>
    </CommandRunnerContext.Provider>
  );
};

/** Run a command by id. Stable identity; does not subscribe the caller to anything. */
export const useExecuteCommand = (): RunCommand => {
  const run = useContext(CommandRunnerContext);
  if (!run) throw new Error('useExecuteCommand must be used within a CommandRunnerProvider');
  return run;
};

/**
 * The current command table, for the few components that list or bind
 * commands (hotkeys, the palette). Re-renders the caller whenever it changes.
 */
export const useCommandTable = (): Record<CommandType, MonoCommand> => {
  const commands = useContext(CommandTableContext);
  if (!commands) throw new Error('useCommandTable must be used within a CommandRunnerProvider');
  return commands;
};
