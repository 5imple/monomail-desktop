import { cn } from '@/renderer/app/lib/utils';
import React, { FC, useMemo } from 'react';
import { Keys } from 'react-hotkeys-hook';
import { cva } from 'class-variance-authority';

export interface ShortcutKeyboardProps {
  shortcut: Keys;
  className?: string;
  keyboardClassName?: string;
  variant?: 'default' | 'flat' | 'text';
  sizeVariant?: 'default' | 'sm' | 'xs';
}

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Convert keys to platform-specific symbols
const keyToIcon = (key: string): string => {
  switch (key.toLowerCase()) {
    case 'ctrl':
    case 'mod':
      return isMac ? '⌘' : 'Ctrl';
    case 'shift':
      return '⇧';
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    case 'option':
      return isMac ? '⌥' : 'Alt';
    case 'meta':
      return '⌘';
    case 'enter':
      return '↵';
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'left':
      return '←';
    case 'right':
      return '→';
    case 'shift+3':
      return '#';
    case 'comma':
      return ',';
    case 'backspace':
      return '⌫';
    default:
      return key.toUpperCase();
  }
};

// Parse shortcut string into an array of keys
const parseShortcut = (shortcut: Keys): string[] =>
  Array.isArray(shortcut) ? shortcut : (shortcut as string).split('+');

// Define styles for keyboard keys
const keyboardVariants = cva(
  'flex items-center justify-center rounded-sm text-[0.7rem] font-medium px-1 transition-all duration-300',
  {
    variants: {
      sizeVariant: {
        default: 'h-5 min-w-5',
        sm: 'h-4 min-w-4 text-[0.65rem]',
        xs: 'h-3 min-w-3 text-[0.6rem]'
      },
      variant: {
        default: 'bg-muted text-muted-foreground border shadow-sm',
        flat: 'bg-muted text-muted-foreground shadow-none',
        text: 'opacity-60 shadow-none p-0 text-sm min-w-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default'
    }
  }
);

const ShortcutKeyboard: FC<ShortcutKeyboardProps> = ({
  shortcut,
  className,
  keyboardClassName,
  variant,
  sizeVariant
}) => {
  if (!shortcut) return null;

  const keys = useMemo(() => parseShortcut(shortcut), [shortcut]);

  return (
    <span className={cn('flex gap-1 text-xs text-muted-foreground', className)}>
      {keys.map((key) => (
        <div
          key={key}
          className={cn(keyboardVariants({ variant, sizeVariant }), keyboardClassName)}
        >
          {keyToIcon(key)}
        </div>
      ))}
    </span>
  );
};

export default ShortcutKeyboard;
