import React, { createContext, useContext, useState } from 'react';

export interface FocusScopeContextProps {
  currentScope: string;
  setScope: (scope: string) => void;
  changeScope: (scope: string) => void;
}

export const FocusScopeContext = createContext<FocusScopeContextProps | undefined>(undefined);
FocusScopeContext.displayName = 'FocusScopeContext';
export const FocusScopeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentScope, setCurrentScope] = useState<string>('GLOBAL');

  const changeScope = (scope: string) => {
    setCurrentScope(scope);
  };

  return (
    <FocusScopeContext.Provider value={{ currentScope, setScope: changeScope, changeScope }}>
      {children}
    </FocusScopeContext.Provider>
  );
};
