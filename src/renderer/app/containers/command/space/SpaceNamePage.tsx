import React, { useState, useEffect } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandIcon
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';

interface SpaceNamePageProps {
  currentName: string;
  onSaveName: (newName: string) => Promise<void>;
  onBack: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SpaceNamePage: React.FC<SpaceNamePageProps> = ({
  currentName,
  onSaveName,
  onBack,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Handle save action
  const handleSave = async () => {
    if (newName.trim() === '') return;
    if (newName === currentName) {
      // No changes, just go back
      onBack();
      return;
    }

    setIsSaving(true);
    try {
      await onSaveName(newName.trim());
      bounce();
      onBack();
    } catch (error) {
      console.error('Failed to save name:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Custom keydown handler
  const handleNameKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newName.trim() !== '') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Backspace' && newName === '') {
      e.preventDefault();
      bounce();
      onBack();
    } else {
      onKeydown(e);
    }
  };

  return (
    <>
      <EnhancedCommandInput
        placeholder={t('command_palette.space.name.placeholder')}
        value={newName}
        onValueChange={setNewName}
        autoFocus
        onKeyDown={handleNameKeydown}
      />

      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        <CommandGroup className="p-2">
          <CommandItem
            variant={'raycast'}
            onSelect={handleSave}
            value={newName}
            disabled={isSaving || newName.trim() === '' || newName === currentName}
          >
            <CommandIcon type="CheckCircle" />
            <span>
              {isSaving
                ? t('command_palette.space.name.saving')
                : t('command_palette.space.name.change_name_to', { name: newName })}
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default SpaceNamePage;
