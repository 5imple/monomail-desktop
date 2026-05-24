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

const navItemVariants = cva(
  cn(
    'h-9 w-full transition-all flex items-center rounded-lg',
    'relative mx-auto justify-start px-3'
  ),
  {
    variants: {
      variant: {
        default: 'hover:bg-muted',
        ghost: 'hover:bg-muted'
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
          'border bg-card text-foreground shadow-sm hover:bg-card before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-r before:bg-chart-1 before:content-[""]'
      },
      {
        variant: 'default',
        active: false,
        className: 'text-muted-foreground'
      },
      {
        variant: 'ghost',
        active: true,
        className: 'bg-muted-low/60 hover:bg-muted-low'
      },
      {
        variant: 'ghost',
        active: false,
        className: 'text-muted-foreground'
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
    const { isWindowFocused } = useWindowFocus();
    const { registerItem, unregisterItem } = useKeyboardNavigationContext();

    // Use ref to store the element reference
    const elementRef = useRef<HTMLDivElement>(null);

    // Local state for the input value during editing
    const [tempTitle, setTempTitle] = useState(title);

    // Flag to prevent immediate blur when entering edit mode
    const [allowBlur, setAllowBlur] = useState(false);

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
      setTempTitle(title); // Reset to original title
      onCancelEdit?.();
    }, [title, onCancelEdit]);

    const handleBlur = useCallback(() => {
      // Only cancel on blur if we allow it (prevents immediate cancellation when entering edit mode)
      if (allowBlur) {
        handleEditCancel();
      }
    }, [allowBlur, handleEditCancel]);

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
              onChange={(e) => setTempTitle(e.target.value)}
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
                    onClick={handleEditConfirm}
                  >
                    <MonoIcon type={'Check'} className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={'ghost'}
                    sizeVariant={'xxs'}
                    typeVariant={'icon'}
                    onClick={handleEditCancel}
                  >
                    <MonoIcon type={'X'} className="h-4 w-4" />
                  </Button>
                </div>
              }
            />
          ) : (
            <span onDoubleClick={handleDoubleClick} className={cn('whitespace-nowrap text-sm')}>
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
