// src/renderer/app/store/extension/useExtensionAtom.ts
import { atom, useAtom } from 'jotai';
import { MonoRecipient } from '@/main/models/types';

// Types
type ExtensionType = 'contacts' | 'calendar' | 'attachments' | null;

interface ExtensionState {
  isExpanded: boolean;
  activeExtension: ExtensionType;
  initialValues: {
    selectedRecipient: MonoRecipient | null;
    // Add other initial values for other extensions as needed
  };
}

// Initial state
const initialState: ExtensionState = {
  isExpanded: false,
  activeExtension: null,
  initialValues: {
    selectedRecipient: null
  }
};

// Create the main atom
const extensionAtom = atom<ExtensionState>(initialState);

// Custom hook to manage the extension state
export function useExtensionAtom() {
  const [extension, setExtension] = useAtom(extensionAtom);

  // Toggle extension panel
  const toggleExtension = (
    type: ExtensionType,
    options?: { selectedRecipient?: MonoRecipient }
  ) => {
    if (extension.activeExtension === type && extension.isExpanded) {
      // Collapse if the same extension is clicked
      setExtension({
        ...extension,
        isExpanded: false,
        activeExtension: null
      });
    } else {
      // Expand with the new extension and set initial values if provided
      setExtension({
        isExpanded: true,
        activeExtension: type,
        initialValues: {
          ...extension.initialValues,
          selectedRecipient: options?.selectedRecipient || extension.initialValues.selectedRecipient
        }
      });
    }
  };

  // Open contacts panel with a specific recipient
  const openContactsPanel = (selectedRecipient: MonoRecipient) => {
    toggleExtension('contacts', { selectedRecipient });
  };

  // Close panel
  const closePanel = () => {
    setExtension({
      ...extension,
      isExpanded: false,
      activeExtension: null
    });
  };

  return {
    extension,
    toggleExtension,
    openContactsPanel,
    closePanel,
    isExpanded: extension.isExpanded,
    activeExtension: extension.activeExtension,
    initialValues: extension.initialValues
  };
}
