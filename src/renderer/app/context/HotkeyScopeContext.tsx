import React, { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { HotkeysProvider, useHotkeysContext } from 'react-hotkeys-hook';

/** Defines the structure of the Hotkey Scope Context */
interface HotkeyScopeContextType {
  activateScope: (scope: string) => void;
  deactivateScope: (scope: string) => void;
  activeScopes: string[];
}

/** Create Context with default undefined value */
const HotkeyScopeContext = createContext<HotkeyScopeContextType | undefined>(undefined);
HotkeyScopeContext.displayName = 'HotkeyScopeProvider';
/** Props for the Provider */
interface HotkeyScopeProviderProps {
  children: ReactNode;
}

export const HotkeyScopeProvider: React.FC<HotkeyScopeProviderProps> = ({ children }) => {
  const { enableScope, disableScope } = useHotkeysContext();
  const [activeScopes, setActiveScopes] = useState<string[]>(['GLOBAL']);

  const activateScope = useCallback(
    (scope: string) => {
      setActiveScopes((prev) => {
        if (!prev.includes(scope)) {
          return [...prev, scope];
        }
        return prev;
      });
      if (!activeScopes.includes(scope)) {
        enableScope(scope);
      }
    },
    [activeScopes, enableScope]
  );

  const deactivateScope = useCallback(
    (scope: string) => {
      setActiveScopes((prev) => {
        if (prev.includes(scope)) {
          return prev.filter((s) => s !== scope);
        }
        return prev;
      });
      if (!activeScopes.includes(scope)) {
        disableScope(scope);
      }
    },
    [activeScopes, disableScope]
  );

  // ✅ Memoize the context value
  const contextValue = useMemo(
    () => ({
      activateScope,
      deactivateScope,
      activeScopes
    }),
    [activateScope, deactivateScope, activeScopes]
  );

  return <HotkeyScopeContext.Provider value={contextValue}>{children}</HotkeyScopeContext.Provider>;
};

/** Custom Hook for consuming Hotkey Scope */
export const useHotkeyScope = (): HotkeyScopeContextType => {
  const context = useContext(HotkeyScopeContext);
  if (!context) {
    throw new Error('useHotkeyScope must be used within a HotkeyScopeProvider');
  }
  return context;
};
