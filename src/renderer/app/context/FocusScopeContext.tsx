import { createContext } from 'react';

export interface FocusScopeContextProps {
  currentScope: string;
  setScope: (scope: string) => void;
  changeScope: (scope: string) => void;
}

export const FocusScopeContext = createContext<FocusScopeContextProps | undefined>(undefined);
FocusScopeContext.displayName = 'FocusScopeContext';
