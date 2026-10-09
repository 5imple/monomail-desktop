import React, { useState } from 'react';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/renderer/app/components/ui/command';
import EnhancedCommandInput from '@/renderer/app/components/ui/EnhancedCommandInput';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
      toast.error(t('command_palette.space.error.update_space'));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle keydown events
  const handleColorKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        // Custom colours aren't supported, so this only searches the list.
        placeholder={t('command_palette.space.color.search_placeholder', 'Search colors')}
        value={searchValue}
        onValueChange={setSearchValue}
        autoFocus
        onKeyDown={handleColorKeydown}
      />

      <CommandList>
        <CommandEmpty>{t('command_palette.no_result')}</CommandEmpty>
        {/* One list: typing used to add a second copy of the matches in
            another style. The hex stays searchable as a keyword. */}
        <CommandGroup
          className="p-2"
          heading={t('command_palette.space.color.select_color_for', { name: spaceName })}
        >
          {COLOR_PALETTE.map((color) => (
            <CommandItem
              key={color.hex}
              variant={'raycast'}
              value={color.name}
              keywords={[color.hex]}
              disabled={isSaving}
              onSelect={() => handleSelectColor(color.hex)}
            >
              <div aria-hidden className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center">
                <span
                  className="h-4 w-4 rounded-full ring-1 ring-border"
                  style={{ backgroundColor: color.hex }}
                />
              </div>
              <span className="mr-2 font-medium">{t(`colors.${color.name.toLowerCase()}`)}</span>
              <span className="text-muted-foreground">{color.hex}</span>
              {color.hex === currentColor && (
                <MonoIcon type="Check" className="ml-auto h-4 w-4 text-muted-foreground" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );
};

export default SpaceColorPage;
