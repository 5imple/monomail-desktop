import {
  FocusScopeContext,
  FocusScopeContextProps
} from '@/renderer/app/context/FocusScopeContext';
import { useContext } from 'react';

export const useFocusScope = (): FocusScopeContextProps => {
  const context = useContext(FocusScopeContext);
  if (!context) {
    throw new Error('useFocusScope must be used within a focusScopeProvider');
  }
  return context;
};
