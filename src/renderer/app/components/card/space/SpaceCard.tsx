import React, { FC, forwardRef, useEffect, useRef } from 'react';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { NotificationBadge } from '@/renderer/app/components/ui/notification-badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/renderer/app/components/ui/context-menu';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSpaceAtom } from '@/renderer/app/store/space/useSpaceAtom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFocusScope } from '@/renderer/app/hooks/useFocusScope';
import useWindowFocus from '@/renderer/app/hooks/useWindowFocus';

interface SpaceCardProps {
  active?: boolean;
  muted?: boolean;
  disabled?: boolean;
  name: string;
  color?: string;
  spaceId: string;
  tooltip?: React.ReactNode;
  icon?: MonoIconType;
  onClick?: (e: React.MouseEvent, spaceId: string) => void;
  onDisabledClick?: (e: React.MouseEvent, spaceId: string) => void;
  onRightClick?: (spaceId: string) => void;
}

const SpaceCard = forwardRef<HTMLButtonElement, SpaceCardProps>(
  (
    {
      onClick,
      onDisabledClick,
      onRightClick,
      spaceId,
      name,
      active,
      muted,
      disabled,
      color,
      icon,
      tooltip,
      ...props
    },
    forwardedRef
  ) => {
    const { t } = useTranslation();
    const { isWindowFocused } = useWindowFocus();
    const { openDialog } = useDialogs();
    const { activeSpace, deleteSpace } = useSpaceAtom();
    const { registerItem, unregisterItem } = useKeyboardNavigationContext();

    const localRef = useRef<HTMLButtonElement>(null);

    // Register/unregister with navigation context
    // useEffect(() => {
    //   const el = localRef.current;
    //   if (el) {
    //     registerItem('space-nav', spaceId, el);
    //     return () => unregisterItem('space-nav', spaceId);
    //   }
    // }, [spaceId, registerItem, unregisterItem]);

    // // Merge forwardedRef with localRef
    // useEffect(() => {
    //   if (!forwardedRef) return;
    //   if (typeof forwardedRef === 'function') {
    //     forwardedRef(localRef.current);
    //   } else {
    //     (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current =
    //       localRef.current;
    //   }
    // }, [forwardedRef]);

    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const handleClick = (e: React.MouseEvent) => {
      if (disabled) {
        onDisabledClick?.(e, spaceId);
      } else {
        onClick?.(e, spaceId);
      }
    };

    const handleRightClick = () => {
      if (!disabled && onRightClick) {
        onRightClick(spaceId);
      } else if (!disabled) {
        // Fallback to default behavior
        openDialog('commandPalette', {
          pages: ['SPACE'],
          selectedSpaceId: spaceId
        });
      }
    };

    const handleDeleteSpace = async () => {
      if (disabled || !activeSpace || activeSpace.id === spaceId) {
        return; // Can't delete disabled or active space
      }

      const confirmed = window.confirm(
        t('command_palette.space.options.delete_confirmation', { name })
      );

      if (confirmed) {
        try {
          await deleteSpace(spaceId);
          toast.success(t('toast.space.delete_success'));
        } catch (error) {
          console.error('Failed to delete space:', error);
          toast.error('Failed to delete space');
        }
      }
    };

    return (
      <div className="relative">
        <ContextMenu>
          <ContextMenuTrigger>
            <Button
              ref={localRef}
              variant={'ghost'}
              className={cn(
                'w-full justify-start rounded-lg p-2',
                active && !disabled && 'bg-muted-low/60 hover:bg-muted-low',
                isWindowFocused ? 'text-foreground' : 'text-muted-foreground',
                // active && !disabled && 'border bg-card shadow-sm',
                disabled && 'cursor-not-allowed opacity-50'
              )}
              style={
                {
                  // backgroundColor: active && color ? `${color}0` : ''
                }
              }
              onMouseEnter={(e) => {
                if (!active && !disabled) {
                  // e.currentTarget.style.boxShadow = `0 10px 15px -3px ${hexToRgba(color, 0.2)}, 0 4px 6px -2px ${hexToRgba(color, 0.1)}`;
                  // e.currentTarget.style.backgroundColor = `${color}10`;
                }
              }}
              onMouseLeave={(e) => {
                if (!active && !disabled) {
                  // e.currentTarget.style.boxShadow = `0 4px 6px -1px ${hexToRgba(color, 0.1)}, 0 2px 4px -1px ${hexToRgba(color, 0.06)}`;
                  // e.currentTarget.style.backgroundColor = '';
                }
              }}
              onClick={handleClick}
              tooltip={tooltip}
              {...props}
            >
              <div className="flex items-center gap-2 overflow-hidden text-ellipsis">
                {muted ? (
                  <div className="flex items-center justify-center rounded-full bg-muted-low p-1 text-muted-foreground">
                    <MonoIcon type={'Moon'} className="h-3.5 w-3.5" />
                  </div>
                ) : (
                  <div
                    className={cn(
                      'ml-2 mr-1 flex h-2 w-2 items-center justify-center rounded bg-accent p-1 text-white'
                    )}
                    style={{
                      backgroundColor: color ? `${color}` : ''
                      // color: `${color}`
                    }}
                  >
                    {/* <MonoIcon type={icon as MonoIconType} /> */}
                  </div>
                )}
                <div className="overflow-hidden text-ellipsis text-sm">
                  <span className="whitespace-nowrap">{name}</span>
                </div>
              </div>
            </Button>
          </ContextMenuTrigger>
          {!disabled && (
            <ContextMenuContent className="dark">
              <ContextMenuItem onClick={handleRightClick}>
                <MonoIcon type="Edit" className="mr-2 h-4 w-4" />
                {t('command_palette.space.options.edit_space', { name })}
              </ContextMenuItem>
              {activeSpace && activeSpace.id !== spaceId && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={handleDeleteSpace}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
                    {t('command_palette.space.options.delete_space')}
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          )}
        </ContextMenu>
        {disabled && (
          <NotificationBadge variant="default" size="sm" dot className="absolute right-2 top-2" />
        )}
      </div>
    );
  }
);

SpaceCard.displayName = 'SpaceCard';

export default SpaceCard;
