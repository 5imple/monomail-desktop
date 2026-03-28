import React, { useState } from 'react';
import { CommandGroup, CommandItem, CommandList } from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';

interface SpaceColorPageProps {
  currentColor: string;
  spaceName: string;
  onSaveColor: (newColor: string) => Promise<void>;
  onBack: () => void;
  bounce: () => void;
  onKeydown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

// Color palette for spaces with descriptive names
const COLOR_PALETTE = [
  { hex: '#035ddf', name: 'Blue' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#facc15', name: 'Yellow' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#fb923c', name: 'Orange' },
  { hex: '#f9a8d4', name: 'Pink' },
  { hex: '#4b5563', name: 'Gray' },
  { hex: '#d1d5db', name: 'Silver' }
];

const SpaceColorPage: React.FC<SpaceColorPageProps> = ({
  currentColor,
  spaceName,
  onSaveColor,
  onBack,
  bounce,
  onKeydown
}) => {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Handle color selection
  const handleSelectColor = async (color: string) => {
    if (color === currentColor) {
      // No changes, just go back
      onBack();
      return;
    }

    setIsSaving(true);
    try {
      await onSaveColor(color);
      bounce();
      onBack();
    } catch (error) {
      console.error('Failed to save color:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle keydown events
  const handleColorKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        placeholder={t('command_palette.space.color.placeholder')}
        value={searchValue}
        onValueChange={setSearchValue}
        autoFocus
        onKeyDown={handleColorKeydown}
      />

      <CommandList>
        <CommandGroup
          className="p-2"
          heading={t('command_palette.space.color.select_color_for', { name: spaceName })}
        >
          {COLOR_PALETTE.map((color) => (
            <CommandItem
              key={color.hex}
              variant={'raycast'}
              value={color.name}
              onSelect={() => handleSelectColor(color.hex)}
            >
              <div
                className="ml-1 mr-2 h-2 w-2 rounded-full"
                style={{ backgroundColor: color.hex }}
              />
              <span className="mr-2 font-medium">{t(`colors.${color.name.toLowerCase()}`)}</span>
              <span className="text-muted-foreground">{color.hex}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Custom color input - Only allow from our predefined list */}
        {searchValue.trim() !== '' && (
          <CommandGroup className="p-2">
            {COLOR_PALETTE.filter(
              (color) =>
                color.name.toLowerCase().includes(searchValue.toLowerCase()) ||
                color.hex.toLowerCase().includes(searchValue.toLowerCase())
            ).map((color) => (
              <CommandItem
                key={`search-${color.hex}`}
                variant={'raycast'}
                onSelect={() => handleSelectColor(color.hex)}
                disabled={isSaving}
              >
                <div className="flex items-center">
                  <div
                    className="mr-2 h-6 w-6 rounded-full"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="flex flex-col">
                    <span>{t(`colors.${color.name.toLowerCase()}`)}</span>
                    <span className="text-xs text-muted-foreground">{color.hex}</span>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
};

export default SpaceColorPage;
