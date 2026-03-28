import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useRef,
  useEffect
} from 'react';
import { toast } from 'sonner';

// Define the type for an undoable action
export interface UndoableAction {
  execute: () => Promise<void>;
  timestamp: number;
  description?: string; // Optional description for debugging or user feedback
  toastId?: string | number; // Optional toast ID to dismiss when undoing
  expirationTime?: number; // Optional per-action expiration time in milliseconds
}

// Create context
interface UndoContextType {
  addUndoAction: (action: UndoableAction) => void;
  undoLastAction: () => Promise<boolean | undefined>; // Update return type to match implementation
  hasUndoActions: boolean;
  clearUndoHistory: () => void;
  getUndoCount: () => number;
}

const UndoContext = createContext<UndoContextType | undefined>(undefined);
UndoContext.displayName = 'UndoContext';
// Provider component
export const UndoProvider = ({
  children,
  defaultExpirationTime = 4500
}: {
  children: ReactNode;
  defaultExpirationTime?: number;
}) => {
  const [undoStack, setUndoStack] = useState<UndoableAction[]>([]);
  const timeoutRefs = useRef<Record<number, NodeJS.Timeout>>({});

  // Clean up timeouts when component unmounts
  useEffect(() => {
    return () => {
      // Clear all timeouts when the component unmounts
      Object.values(timeoutRefs.current).forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
    };
  }, []);

  // Add an action to the undo stack
  const addUndoAction = useCallback(
    (action: UndoableAction) => {
      // Use action's specific expiration time or the default
      const expTime =
        action.expirationTime !== undefined ? action.expirationTime : defaultExpirationTime;

      // Create a unique identifier for this action based on timestamp
      const actionId = action.timestamp;

      setUndoStack((prev) => [...prev, action]);

      // Clear any existing timeout for this action ID (shouldn't happen, but just in case)
      if (timeoutRefs.current[actionId]) {
        clearTimeout(timeoutRefs.current[actionId]);
      }

      // Set a new timeout for this action
      const timeoutId = setTimeout(() => {
        setUndoStack((prevStack) => prevStack.filter((a) => a.timestamp !== actionId));
        // Remove the reference to this timeout
        delete timeoutRefs.current[actionId];
      }, expTime);

      // Store the timeout ID so we can clean it up if needed
      timeoutRefs.current[actionId] = timeoutId;
    },
    [defaultExpirationTime]
  );

  // Execute the most recent undo action
  const undoLastAction = useCallback(async () => {
    if (undoStack.length === 0) return undefined;

    const lastAction = undoStack[undoStack.length - 1];
    try {
      console.log('Executing undo action:', lastAction);

      // If this action has a toast ID, dismiss only that specific toast
      if (lastAction.toastId) {
        toast.dismiss(lastAction.toastId);
      }

      // Clear the timeout for this action
      const actionId = lastAction.timestamp;
      if (timeoutRefs.current[actionId]) {
        clearTimeout(timeoutRefs.current[actionId]);
        delete timeoutRefs.current[actionId];
      }

      await lastAction.execute();

      // Remove the action from the stack after successful execution
      setUndoStack((prev) => prev.slice(0, -1));
      return true;
    } catch (error) {
      console.error('Error executing undo action:', error);
      // Still remove the action even if it fails to prevent repeatedly trying
      // a failed undo action
      setUndoStack((prev) => prev.slice(0, -1));
      throw error;
    }
  }, [undoStack]);

  // Clear all undo history
  const clearUndoHistory = useCallback(() => {
    // Clear all timeouts
    Object.values(timeoutRefs.current).forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    timeoutRefs.current = {};

    setUndoStack([]);
  }, []);

  // Get the number of available undo actions
  const getUndoCount = useCallback(() => {
    return undoStack.length;
  }, [undoStack]);

  const value = {
    addUndoAction,
    undoLastAction,
    hasUndoActions: undoStack.length > 0,
    clearUndoHistory,
    getUndoCount
  };

  return <UndoContext.Provider value={value}>{children}</UndoContext.Provider>;
};

// Hook to use the undo functionality
export const useUndoManager = () => {
  const context = useContext(UndoContext);
  if (context === undefined) {
    throw new Error('useUndoManager must be used within an UndoProvider');
  }
  return context;
};
