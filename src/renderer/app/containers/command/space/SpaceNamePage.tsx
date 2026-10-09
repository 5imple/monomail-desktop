import React, { useState, useEffect } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandIcon
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
  // Start from the current name (selected, so typing replaces it) instead of
  // an empty field and a 'Change name to ""' row.
  const [newName, setNewName] = useState(currentName);
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
      toast.error(t('command_palette.space.error.update_space'));
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
      // A held key steps back at most once.
      if (e.repeat) return;
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
        onFocus={(e) => e.currentTarget.select()}
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
