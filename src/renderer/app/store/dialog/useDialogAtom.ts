import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { dialogStateAtom, DialogState } from '@/renderer/app/store/dialog/atoms';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

export function useDialogs() {
  const [dialogState, setDialogState] = useAtom<DialogState>(dialogStateAtom);
  const { activateScope, deactivateScope } = useHotkeyScope();

  // Function to open a dialog, optionally with additional properties
  const openDialog = useCallback(
    (dialog: keyof typeof dialogState, props = {}) => {
      activateScope('DIALOG');
      setDialogState((prevState) => ({
        ...prevState,
        [dialog]: {
          ...prevState[dialog],
          open: true,
          ...props // Merge additional props
        }
      }));
    },
    [setDialogState, activateScope]
  );

  // Function to close a dialog
  const closeDialog = useCallback(
    (dialog: keyof typeof dialogState) => {
      deactivateScope('DIALOG');
      setDialogState((prevState) => ({
        ...prevState,
        [dialog]: {
          ...prevState[dialog],
          open: false,
          // Reset aiSearchMode and selectedSpaceId when closing commandPalette
          ...(dialog === 'commandPalette' && { aiSearchMode: false, selectedSpaceId: undefined })
        }
      }));
    },
    [setDialogState, deactivateScope]
  );

  return {
    dialogState,
    setDialogState,
    openDialog,
    closeDialog
  };
}
