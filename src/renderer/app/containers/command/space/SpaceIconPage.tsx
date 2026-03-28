import React, { useState } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandIcon,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';
import { AVAILABLE_ICONS } from '@/renderer/app/lib/availableIcons';

interface SpaceIconPageProps {
  currentIcon: string;
  spaceName: string;
  onSaveIcon: (newIcon: string) => Promise<void>;
  onBack: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const SpaceIconPage: React.FC<SpaceIconPageProps> = ({
  currentIcon,
  spaceName,
  onSaveIcon,
  onBack,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter icons based on search
  const filteredIcons =
    searchValue.trim() === ''
      ? AVAILABLE_ICONS
      : AVAILABLE_ICONS.filter((icon) => icon.toLowerCase().includes(searchValue.toLowerCase()));

  // Handle icon selection
  const handleSelectIcon = async (icon: string) => {
    if (icon === currentIcon) {
      // No changes, just go back
      onBack();
      return;
    }

    setIsSaving(true);
    try {
      await onSaveIcon(icon);
      bounce();
      onBack();
    } catch (error) {
      console.error('Failed to save icon:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle keydown events
  const handleIconKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchValue === '') {
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
        placeholder={t('command_palette.space.icon.placeholder')}
        value={searchValue}
        onValueChange={setSearchValue}
        autoFocus
        onKeyDown={handleIconKeydown}
      />

      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>

        <CommandGroup
          className="p-2"
          heading={t('command_palette.space.icon.select_icon_for', { name: spaceName })}
        >
          {filteredIcons.map((icon) => (
            <CommandItem
              key={icon}
              variant={'raycast'}
              value={icon}
              onSelect={() => handleSelectIcon(icon)}
            >
              <CommandIcon type={icon as MonoIconType} className="mr-2" />
              <span>{icon}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default SpaceIconPage;
