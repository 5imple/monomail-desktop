import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/SidebarIcon';
import { Button } from '@/renderer/app/components/ui/button';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import { Input } from '@/renderer/app/components/ui/input';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import useWindowFocus from '@/renderer/app/hooks/useWindowFocus';
import { cn } from '@/renderer/app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Keys, useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';

// Fills use the foreground-alpha scale of the thread rows, so selected always
// reads stronger than hover in every theme (dark's --muted hover was lighter
// than the selected fill). Only background/shadow animate: animating the text
// colour left the selected label dark-on-dark for a while after a theme flip.
const NAV_ROW_HOVER = 'pointer-hover:bg-foreground/[0.045] dark:pointer-hover:bg-foreground/[0.07]';

const navItemVariants = cva(
  cn(
    'h-9 w-full transition-[background-color,box-shadow] flex items-center rounded-lg',
    'relative mx-auto justify-start px-3'
  ),
  {
    variants: {
      variant: {
        default: '',
        ghost: ''
      },
      active: {
        true: '',
        false: ''
      }
    },
    compoundVariants: [
      {
        variant: 'default',
        active: true,
        // Card lift + 2px lime left tab — Newton "active" signal via
        // `--chart-1`, mirroring the DraftCard red-stripe convention.
        className:
          'border border-border/70 bg-card text-foreground shadow-[0_1px_1.5px_rgba(0,0,0,0.05)] hover:bg-card dark:shadow-[0_1px_1.5px_rgba(0,0,0,0.22)] before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-r before:bg-chart-1 before:content-[""]'
      },
      {
        variant: 'default',
        active: false,
        className: cn('text-muted-foreground', NAV_ROW_HOVER)
      },
      {
        variant: 'ghost',
        active: true,
        className: 'bg-foreground/[0.07] text-foreground dark:bg-foreground/[0.12]'
      },
      {
        variant: 'ghost',
        active: false,
        className: cn('text-muted-foreground', NAV_ROW_HOVER)
      }
    ],
    defaultVariants: {
      variant: 'default',
      active: false
    }
  }
);

interface NavItemProps extends VariantProps<typeof navItemVariants> {
  id?: string;
  className?: string;
  onRemove?(): void;
  onEdit?(newTitle: string): void;
  onCancelEdit?(): void;
  onClick?: (e?: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  title: string;
  hotkey?: Keys;
  icon?: MonoIconType;
  append?: ReactNode;
  prepend?: ReactNode;
  iconColor?: string;
  isEditing?: boolean;
}

const NavItem = React.memo<NavItemProps>(
  ({
    id,
    className,
    onRemove,
    onEdit,
    onCancelEdit,
    active = false,
    onClick,
    onDoubleClick,
    title,
    hotkey,
    icon: iconName = '',
    iconColor,
    append,
    prepend,
    variant = 'default',
    isEditing = false,
    ...props
  }) => {
    const { t } = useTranslation();
    const { isWindowFocused } = useWindowFocus();
    const { registerItem, unregisterItem } = useKeyboardNavigationContext();

    // Use ref to store the element reference
    const elementRef = useRef<HTMLDivElement>(null);

    // Local state for the input value during editing
    const [tempTitle, setTempTitle] = useState(title);

    // Flag to prevent immediate blur when entering edit mode
    const [allowBlur, setAllowBlur] = useState(false);

    // One decision per rename: Enter / Escape / Save / Cancel settle it, so the
    // blur that follows (the input unmounting) can't commit an Escape or call
    // onEdit a second time.
    const settledRef = useRef(false);
    useEffect(() => {
      if (isEditing) settledRef.current = false;
    }, [isEditing]);

    // Register/unregister the item when id changes or component mounts/unmounts
    useEffect(() => {
      if (id && elementRef.current) {
        registerItem('sidebar-nav', id, elementRef.current);
      }

      return () => {
        if (id) {
          unregisterItem('sidebar-nav', id);
        }
      };
    }, [id, registerItem, unregisterItem]);

    // Reset temp title when title changes or editing starts
    useEffect(() => {
      setTempTitle(title);
    }, [title, isEditing]);

    // Handle allowBlur flag when entering/exiting edit mode
    useEffect(() => {
      if (isEditing) {
        setAllowBlur(false);
        // Allow blur after a short delay to prevent immediate cancellation
        const timer = setTimeout(() => {
          setAllowBlur(true);
        }, 200);
        return () => clearTimeout(timer);
      } else {
        setAllowBlur(false);
        return;
      }
    }, [isEditing]);

    const onClickHotkey = useCallback(
      (event: KeyboardEvent) => {
        event.preventDefault();
        onClick?.();
      },
      [onClick]
    );

    if (hotkey && onClick) {
      useHotkeys(hotkey, onClickHotkey, { preventDefault: true }, [onClickHotkey, hotkey]);
    }

    const handleEditConfirm = useCallback(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      if (tempTitle.length === 0) {
        // If empty, cancel edit
        onCancelEdit?.();
        return;
      }

      if (tempTitle !== title && onEdit) {
        onEdit(tempTitle);
      } else {
        // If no change, just cancel
        onCancelEdit?.();
      }
    }, [tempTitle, title, onEdit, onCancelEdit]);

    const handleEditCancel = useCallback(() => {
      if (settledRef.current) return;
      settledRef.current = true;
      setTempTitle(title); // Reset to original title
      onCancelEdit?.();
    }, [title, onCancelEdit]);

    const handleBlur = useCallback(() => {
      // Clicking elsewhere keeps what was typed (it used to throw it away);
      // Escape is the way to cancel. allowBlur skips the blur right after
      // edit mode opens.
      if (allowBlur) {
        handleEditConfirm();
      }
    }, [allowBlur, handleEditConfirm]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          handleEditConfirm();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          handleEditCancel();
        }
      },
      [handleEditConfirm, handleEditCancel]
    );

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (onClick) {
          onClick(event);
        }
      },
      [onClick]
    );

    const handleDoubleClick = useCallback(
      (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (onDoubleClick) {
          onDoubleClick();
        }
      },
      [onDoubleClick]
    );

    return (
      <div
        id={id}
        ref={elementRef}
        tabIndex={0}
        onClick={handleClick}
        className={cn(
          navItemVariants({ variant, active }),
          isWindowFocused ? '' : 'text-muted-foreground',
          ringVariants,
          append && 'pr-[6px]',
          className
        )}
      >
        <div>{prepend}</div>
        {iconName && (
          <MonoIcon
            type={iconName as MonoIconType}
            className={cn(
              'mr-2 h-4 w-4 shrink-0',
              active ? 'text-foreground' : '',
              active && iconColor && `${iconColor}`,
              isWindowFocused ? '' : 'text-muted-foreground'
            )}
          />
        )}

        <div className="flex-1 overflow-hidden text-ellipsis">
          {isEditing ? (
            <Input
              autoFocus
              value={tempTitle}
              onChange={(e) => {
                // Typing again after a rename that didn't take reopens the decision.
                settledRef.current = false;
                setTempTitle(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              sizeVariant={'sm'}
              variant={'transparent'}
              className="-ml-2"
              append={
                <div className="flex gap-2">
                  <Button
                    disabled={tempTitle === title || tempTitle.length === 0}
                    variant={'ghost'}
                    sizeVariant={'xxs'}
                    typeVariant={'icon'}
                    aria-label={t('sidebar.save_name')}
                    // Keep focus in the input: the blur from pressing this
                    // button cancelled the edit before its click could save.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleEditConfirm}
                  >
                    <MonoIcon type={'Check'} className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={'ghost'}
                    sizeVariant={'xxs'}
                    typeVariant={'icon'}
                    aria-label={t('sidebar.cancel_rename')}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleEditCancel}
                  >
                    <MonoIcon type={'X'} className="h-4 w-4" />
                  </Button>
                </div>
              }
            />
          ) : (
            // title: the sidebar is a fixed 220px, so long addresses and
            // folder names are cut off — hover shows the whole label.
            <span
              onDoubleClick={handleDoubleClick}
              className={cn('whitespace-nowrap text-sm')}
              title={title}
            >
              {title}
            </span>
          )}
        </div>
        <div>{append}</div>
      </div>
    );
  }
);
NavItem.displayName = 'NavItem';

export default NavItem;
