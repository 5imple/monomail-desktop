import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { CommandType } from '@/renderer/app/types';
import React, { createContext, useCallback, useContext, useRef } from 'react';

type RunCommand = (commandId: CommandType, args?: unknown) => Promise<void | 'page'>;

const RowCommandContext = createContext<RunCommand | null>(null);
RowCommandContext.displayName = 'RowCommandContext';

/**
 * One command runner for every row. useExecuteCommand builds the whole command
 * table from a dozen stores; called in each row, it ran for every row on every
 * change to any thread (opening an email re-rendered the entire list before
 * the reader could show it). The list calls it once and hands the rows a
 * function whose identity never changes, so a row re-renders for its own
 * reasons only.
 */
export const RowCommandProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const executeCommand = useExecuteCommand();
  const latest = useRef(executeCommand);
  latest.current = executeCommand;
  const run = useCallback<RunCommand>((commandId, args) => latest.current(commandId, args), []);
  return <RowCommandContext.Provider value={run}>{children}</RowCommandContext.Provider>;
};

export const useRowCommand = (): RunCommand => {
  const run = useContext(RowCommandContext);
  if (!run) throw new Error('useRowCommand must be used within a RowCommandProvider');
  return run;
};
