import React, { useCallback, useState } from 'react';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { toast } from 'sonner';
import SpaceSelectionPage from './SpaceSelectionPage';
import SpaceAccountPage from './SpaceAccountPage';
import SpaceOptionsPage from './SpaceOptionsPage';
import SpaceNamePage from './SpaceNamePage';
import SpaceIconPage from './SpaceIconPage';
import SpaceColorPage from './SpaceColorPage';
import { useTranslation } from 'react-i18next';

interface SpaceCommandPageProps {
  selectedSpaceId?: string;
  onClose: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

type SpaceStep = 'selection' | 'options' | 'accounts' | 'name' | 'icon' | 'color' | 'delete';

const SpaceCommandPage: React.FC<SpaceCommandPageProps> = ({
  selectedSpaceId: initialSpaceId,
  onClose,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const { spaces, createSpace, updateSpace, updateAccountToSpace, switchSpace, deleteSpace } =
    useSpaceAtom();

  const [spaceName, setSpaceName] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [step, setStep] = useState<SpaceStep>('selection');
  const [searchValue, setSearchValue] = useState('');

  // Auto-select space if initialSpaceId is provided
  React.useEffect(() => {
    if (initialSpaceId && spaces.length > 0) {
      const space = spaces.find((s) => s.id === initialSpaceId);
      if (space) {
        setSelectedSpaceId(initialSpaceId);
        setSpaceName(space.name);
        setSelectedAccountIds(space.accountUids);
        setStep('options'); // Go directly to options for existing space
      }
    }
  }, [initialSpaceId, spaces]);

  // Get the selected space if any
  const selectedSpace = selectedSpaceId
    ? spaces.find((space) => space.id === selectedSpaceId)
    : null;

  // Handle space selection
  const handleSelectSpace = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    const space = spaces.find((s) => s.id === spaceId);
    if (space) {
      setSpaceName(space.name);
      setSelectedAccountIds(space.accountUids);
      setSelectedSpaceId(spaceId);
      // Go to options page when editing existing space
      setStep('options');
    }
  };

  // Handle new space creation
  const handleCreateNew = () => {
    setSelectedSpaceId(null);
    setSelectedAccountIds([]);
    // Go directly to accounts page for new space
    setStep('accounts');
  };

  // Navigation handlers for options page
  const handleGoToAccounts = () => {
    bounce();
    setStep('accounts');
  };

  const handleGoToName = () => {
    bounce();
    setStep('name');
  };

  const handleGoToIcon = () => {
    bounce();
    setStep('icon');
  };

  const handleGoToColor = () => {
    bounce();
    setStep('color');
  };

  // Handle deletion of a space
  const handleDeleteSpace = async () => {
    if (!selectedSpaceId) return;

    try {
      await deleteSpace(selectedSpaceId);
      toast.success(t('toast.space.delete_success'));
      onClose();
    } catch (error) {
      console.error('Failed to delete space:', error);
      toast.error('Failed to delete space');
    }
  };

  // Handle space name update
  const handleSaveName = async (newName: string) => {
    if (!selectedSpaceId || !selectedSpace) return;

    await updateSpace(selectedSpaceId, {
      name: newName,
      color: selectedSpace.color,
      icon: selectedSpace.icon
    });

    setSpaceName(newName);
    toast.success(t('toast.space.name_updated'));
  };

  // Handle space icon update
  const handleSaveIcon = async (newIcon: string) => {
    if (!selectedSpaceId || !selectedSpace) return;

    await updateSpace(selectedSpaceId, {
      name: selectedSpace.name,
      color: selectedSpace.color,
      icon: newIcon
    });

    toast.success(t('toast.space.icon_updated'));
  };

  // Handle space color update
  const handleSaveColor = async (newColor: string) => {
    if (!selectedSpaceId || !selectedSpace) return;

    await updateSpace(selectedSpaceId, {
      name: selectedSpace.name,
      color: newColor,
      icon: selectedSpace.icon
    });

    toast.success(t('toast.space.color_updated'));
  };

  // Handle creation or update of a space
  const handleSaveSpace = useCallback(async () => {
    if (!spaceName.trim()) {
      toast.error('Please enter a space name');
      return;
    }

    if (selectedAccountIds.length === 0) {
      toast.error('Please select at least one account');
      return;
    }

    try {
      if (selectedSpaceId && selectedSpace) {
        // First update space properties if they changed
        if (spaceName !== selectedSpace.name) {
          await updateSpace(selectedSpaceId, {
            name: spaceName,
            color: selectedSpace.color,
            icon: selectedSpace.icon
          });
        }

        // Then update accounts
        await updateAccountToSpace(selectedSpaceId, selectedAccountIds);

        // Switch to the updated space
        switchSpace(selectedSpaceId);
      } else {
        // Create new space
        const newSpace = await createSpace({
          id: '',
          name: spaceName,
          accountUids: selectedAccountIds,
          activeAccountUids: selectedAccountIds,
          color: '#035ddf', // Default color
          icon: 'Home', // Default icon
          pinnedEmails: []
        });

        // Switch to the new space if it was created successfully
        if (newSpace && newSpace.id) {
          switchSpace(newSpace.id);
        }
      }

      // Close the command palette
      onClose();
    } catch (error) {
      console.error('Failed to save space:', error);
      toast.error(selectedSpaceId ? 'Failed to update space' : 'Failed to create space');
    }
  }, [
    spaceName,
    selectedSpaceId,
    selectedSpace,
    selectedAccountIds,
    spaces.length,
    createSpace,
    updateSpace,
    updateAccountToSpace,
    switchSpace,
    onClose
  ]);

  // Handle saving account changes and return to options
  const handleSaveAccounts = useCallback(async () => {
    if (selectedAccountIds.length === 0) {
      toast.error('Please select at least one account');
      return;
    }

    if (selectedSpaceId && selectedSpace) {
      try {
        // Update accounts for existing space
        await updateAccountToSpace(selectedSpaceId, selectedAccountIds);
        toast.success(t('toast.space.accounts_updated'));
        // Return to options page
        bounce();
        setStep('options');
      } catch (error) {
        console.error('Failed to update accounts:', error);
        toast.error('Failed to update accounts');
      }
    } else {
      // For new space, continue with space creation
      handleSaveSpace();
    }
  }, [
    selectedSpaceId,
    selectedSpace,
    selectedAccountIds,
    updateAccountToSpace,
    handleSaveSpace,
    bounce
  ]);

  // Page-specific key handling
  const handleAccountPageKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchValue === '') {
      e.preventDefault();
      bounce();
      // Go back to appropriate page based on if we're editing or creating
      setStep(selectedSpaceId ? 'options' : 'selection');
    } else {
      // Pass other keydown events to the parent handler
      onKeydown(e);
    }
  };

  const handleOptionsPageKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchValue === '') {
      e.preventDefault();
      bounce();
      setSpaceName('');
      setStep('selection');
    } else {
      // Pass other keydown events to the parent handler
      onKeydown(e);
    }
  };

  // Render the appropriate step
  switch (step) {
    case 'selection':
      return (
        <SpaceSelectionPage
          spaceName={spaceName}
          setSpaceName={setSpaceName}
          onSelectSpace={handleSelectSpace}
          onCreateNew={handleCreateNew}
          bounce={bounce}
          onKeydown={onKeydown}
        />
      );

    case 'options':
      return (
        <SpaceOptionsPage
          selectedSpaceId={selectedSpaceId}
          spaceName={spaceName}
          onGoToAccounts={handleGoToAccounts}
          onGoToName={handleGoToName}
          onGoToIcon={handleGoToIcon}
          onGoToColor={handleGoToColor}
          onDeleteSpace={handleDeleteSpace}
          onBack={() => {
            bounce();
            setSpaceName('');
            setStep('selection');
          }}
          bounce={bounce}
          onKeydown={handleOptionsPageKeydown}
          searchValue={searchValue}
          setSearchValue={setSearchValue}
        />
      );

    case 'accounts':
      return (
        <SpaceAccountPage
          spaceName={selectedSpace ? selectedSpace.name : spaceName}
          selectedAccountIds={selectedAccountIds}
          setSelectedAccountIds={setSelectedAccountIds}
          searchValue={searchValue}
          setSearchValue={setSearchValue}
          onBack={() => {
            bounce();
            setStep(selectedSpaceId ? 'options' : 'selection');
          }}
          onCreateSpace={selectedSpaceId ? handleSaveAccounts : handleSaveSpace}
          bounce={bounce}
          onKeydown={handleAccountPageKeydown}
          isEditing={!!selectedSpaceId}
        />
      );

    case 'name':
      return (
        <SpaceNamePage
          currentName={selectedSpace ? selectedSpace.name : spaceName}
          onSaveName={handleSaveName}
          onBack={() => {
            bounce();
            setStep('options');
          }}
          bounce={bounce}
          onKeydown={onKeydown}
        />
      );

    case 'icon':
      return (
        <SpaceIconPage
          currentIcon={selectedSpace ? selectedSpace.icon || 'Home' : 'Home'}
          spaceName={spaceName}
          onSaveIcon={handleSaveIcon}
          onBack={() => {
            bounce();
            setStep('options');
          }}
          bounce={bounce}
          onKeydown={onKeydown}
        />
      );

    case 'color':
      return (
        <SpaceColorPage
          currentColor={selectedSpace ? selectedSpace.color || '#035ddf' : '#035ddf'}
          spaceName={spaceName}
          onSaveColor={handleSaveColor}
          onBack={() => {
            bounce();
            setStep('options');
          }}
          bounce={bounce}
          onKeydown={onKeydown}
        />
      );

    // Delete is handled directly in the options page, no separate page
    default:
      return (
        <SpaceOptionsPage
          selectedSpaceId={selectedSpaceId}
          spaceName={spaceName}
          onGoToAccounts={handleGoToAccounts}
          onGoToName={handleGoToName}
          onGoToIcon={handleGoToIcon}
          onGoToColor={handleGoToColor}
          onDeleteSpace={handleDeleteSpace}
          onBack={() => {
            bounce();

            setSpaceName('');
            setStep('selection');
          }}
          bounce={bounce}
          onKeydown={handleOptionsPageKeydown}
          searchValue={searchValue}
          setSearchValue={setSearchValue}
        />
      );
  }
};

export default SpaceCommandPage;
