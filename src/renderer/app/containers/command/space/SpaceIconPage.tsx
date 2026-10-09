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
import { toast } from 'sonner';
import { AVAILABLE_ICONS } from '@/renderer/app/lib/availableIcons';

// "UserGroup" → "User group", "PaintBrush" → "Paint brush".
const humanize = (icon: string) => {
  const words = icon.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

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

  // Filter icons based on search (raw or readable name)
  const filteredIcons =
    searchValue.trim() === ''
      ? AVAILABLE_ICONS
      : AVAILABLE_ICONS.filter(
          (icon) =>
            icon.toLowerCase().includes(searchValue.toLowerCase()) ||
            humanize(icon).toLowerCase().includes(searchValue.toLowerCase())
        );

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
      toast.error(t('command_palette.space.error.update_space'));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle keydown events
  const handleIconKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchValue === '') {
      e.preventDefault();
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
              keywords={[humanize(icon)]}
              disabled={isSaving}
              onSelect={() => handleSelectIcon(icon)}
            >
              <CommandIcon type={icon as MonoIconType} />
              <span className="min-w-0 flex-1 truncate">{humanize(icon)}</span>
              {icon === currentIcon && (
                <MonoIcon type="Check" className="ml-2 h-4 w-4 text-muted-foreground" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default SpaceIconPage;
