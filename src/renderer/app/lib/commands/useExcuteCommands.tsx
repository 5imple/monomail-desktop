import { useMemo } from 'react';
import { useCommands } from '@/renderer/app/lib/commands/useCommands';
import { CommandType } from '@/renderer/app/types';

export const useExecuteCommand = () => {
  const commands = useCommands();

  const memoizedCommands = useMemo(() => commands, [commands]);

  return async (commandId: CommandType, args?: any): Promise<void | 'page'> => {
    const command = memoizedCommands[commandId];
    if (!command) throw new Error(`Command with ID ${commandId} not found`);

    return command.action(args);
  };
};
