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

// Newton kbd chip: IBM Plex Mono, tabular alignment, calm muted-low
// background. The chip reads as a tiny piece of code rather than a
// chunky button — fits inline next to a verb without dominating the
// surrounding sentence.
const keyboardVariants = cva(
  'inline-flex items-center justify-center rounded-[3px] px-1 font-mono text-[10px] font-medium tabular-nums leading-none tracking-tight transition-colors',
  {
    variants: {
      sizeVariant: {
        default: 'h-[18px] min-w-[18px]',
        sm: 'h-4 min-w-4 text-[10px]',
        xs: 'h-3.5 min-w-3.5 text-[9px]'
      },
      variant: {
        default:
          'bg-muted-low/80 text-muted-foreground border border-border/60 shadow-[inset_0_-1px_0_hsl(var(--border)/0.6)]',
        flat: 'bg-muted-low/60 text-muted-foreground',
        text: 'p-0 text-[11px] text-muted-foreground/80'
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
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className={cn(keyboardVariants({ variant, sizeVariant }), keyboardClassName)}
        >
          {keyToIcon(key)}
        </kbd>
      ))}
    </span>
  );
};

export default ShortcutKeyboard;
