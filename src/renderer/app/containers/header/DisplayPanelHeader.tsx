import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { forwardRef, useCallback, useMemo, useRef, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import { useThreadLabelAtom } from '@/renderer/app/store/thread/useThreadLabels';

interface DisplayPanelHeaderProps {
  thread: MonoThread | null;
  handlePrint: () => void;
  isPrinting: boolean;
  handleCollapseAll: () => void;
  handleExpandAll: () => void;
}

const DisplayPanelHeader = forwardRef<HTMLDivElement, DisplayPanelHeaderProps>(
  ({ thread, handlePrint, isPrinting }, ref) => {
    const { setActiveThreadId } = useThreadAtom();
    const { removeLabelFromThread } = useThreadLabelAtom();
    const { t } = useTranslation();
    const { activateScope, deactivateScope, activeScopes } = useHotkeyScope();
    const { setFullscreenDisplayPanel, fullscreenDisplayPanel } = useGlobalAtom();
    const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
    const { openDialog } = useDialogs();
    const executeCommand = useExecuteCommand();
    const { trackEvent } = useUserTrackingData();
    const { labelsMapByAccount } = useLabelAtom();

    // Keyboard navigation
    const { registerItem, unregisterItem, registerAreaRef } = useKeyboardNavigationContext();

    // Refs for keyboard navigation
    const headerContainerRef = useRef<HTMLDivElement>(null);
    const closePanelRef = useRef<HTMLButtonElement>(null);
    const fullscreenRef = useRef<HTMLButtonElement>(null);
    const reminderRef = useRef<HTMLButtonElement>(null);
    const labelRef = useRef<HTMLButtonElement>(null);
    const starRef = useRef<HTMLButtonElement>(null);
    const doneRef = useRef<HTMLButtonElement>(null);
    // Register keyboard navigation items
    useEffect(() => {
      // Register the container area
      if (headerContainerRef.current) {
        registerAreaRef('display-header', headerContainerRef.current);
      }

      // Build navigation items array based on available buttons
      const navigationItems = [
        { id: 'close-panel', ref: closePanelRef.current },
        { id: 'fullscreen-toggle', ref: fullscreenRef.current }
      ];

      if (thread) {
        navigationItems.push(
          { id: 'reminder', ref: reminderRef.current },
          // { id: 'label', ref: labelRef.current },
          { id: 'star-toggle', ref: starRef.current },
          { id: 'done-toggle', ref: doneRef.current }
        );
      }

      // Register each navigation item
      navigationItems.forEach((item) => {
        if (item.ref) {
          registerItem('display-header', item.id, item.ref);
        }
      });

      // Cleanup function
      return () => {
        navigationItems.forEach((item) => {
          unregisterItem('display-header', item.id);
        });
      };
    }, [thread?.id, registerItem, unregisterItem, registerAreaRef]);

    const handleDone = async () => {
      if (thread) {
        executeCommand('THREAD_DONE', { threadIds: [thread.id] });
        trackEvent('thread_doned', {
          thread_id: thread.id
        });
      }
    };
    const handleUnDone = async () => {
      if (thread) {
        executeCommand('THREAD_UNDONE', { threadIds: [thread.id] });
        trackEvent('thread_undoned', {
          thread_id: thread.id
        });
      }
    };

    const handleStarThread = async () => {
      if (thread) {
        executeCommand('THREAD_STAR', { threadIds: [thread.id] });
        trackEvent('thread_starred', { thread_id: thread.id });
      }
    };

    const handleUnstarThread = async () => {
      if (thread) {
        executeCommand('THREAD_UNSTAR', { threadIds: [thread.id] });
        trackEvent('thread_unstarred', { thread_id: thread.id });
      }
    };

    const handleRemoveLabel = async (labelId: string) => {
      if (!thread) return;
      const accountId = thread.accountId;
      if (!accountId) return;
      await removeLabelFromThread(accountId, [thread.id], labelId);

      trackEvent('removed_label', { thread_id: thread.id });
    };

    const handleClosePanel = async () => {
      if (thread) {
        setActiveThreadId(null);
        setFullscreenDisplayPanel(false);
        trackEvent('panel_closed', { thread_id: thread.id });
      }
    };

    const togglePanelFullscreen = () => {
      setFullscreenDisplayPanel((prev) => {
        const newState = !prev;
        trackEvent('panel_fullscreen_toggled', { fullscreen: newState });
        return newState;
      });
    };

    // Get the appropriate labels based on thread's account ID
    const threadLabels = useMemo(() => {
      if (!thread) return {};
      const accountId = thread.accountId;
      if (!accountId) return {};

      return labelsMapByAccount[accountId] || {};
    }, [thread, labelsMapByAccount]);

    // Get unique label IDs to avoid React key warnings
    const uniqueLabelIds = useMemo(() => {
      if (!thread) return [];
      // Create a Set of labelIds that start with 'Label_' to ensure uniqueness
      return [...new Set(thread.labelIds.filter((label) => label.includes('Label_')))];
    }, [thread]);

    const isNavigationEnabled = useCallback(() => {
      return (
        !activeScopes.includes('DIALOG') &&
        !activeScopes.includes('DROPDOWN_MENU') &&
        !activeScopes.includes('GLOBAL_COMPOSE')
      );
    }, [activeScopes]);

    useHotkeys(
      'ESC',
      handleClosePanel,
      { preventDefault: true, enabled: isNavigationEnabled(), scopes: ['CONVERSATION_DISPLAY'] },
      [handleClosePanel]
    );

    return (
      <div className="drag relative">
        <div ref={ref} className="w-full">
          <div
            ref={headerContainerRef}
            className="relative flex h-11 items-center"
            data-focusable-area="display-header"
          >
            {/* Back button — absolute left */}
            <div
              className={cn(
                'absolute left-0 flex items-center pl-4',
                !sidebarLoading && 'transition-all duration-200',
                sidebarCollapsed && isElectron && fullscreenDisplayPanel ? 'translate-x-[88px]' : ''
              )}
            >
              <Button
                ref={closePanelRef}
                className="text-muted-foreground hover:text-foreground"
                tooltip={t('header.display.close_panel')}
                variant="ghost"
                shortcut="ESC"
                sizeVariant="sm"
                typeVariant="icon"
                onClick={handleClosePanel}
                data-keyboard-item="close-panel"
              >
                <MonoIcon type="ChevronsRight" />
              </Button>
            </div>

            {/* Action buttons — centered */}
            {thread && thread.id.length < 20 && (
              <div className="flex w-full items-center justify-center gap-[22px]">
                <Button
                  ref={reminderRef}
                  className="text-[#8c8c88] hover:bg-white/[0.06] hover:text-[#f4f2ed]"
                  tooltip={t('header.display.reminder')}
                  shortcut="H"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onClick={() => {
                    openDialog('commandPalette', { pages: ['REMINDER'] });
                    trackEvent('reminder_opened', { thread_id: thread.id });
                  }}
                  disabled={!thread}
                  data-keyboard-item="reminder"
                >
                  <MonoIcon type="Clock" />
                </Button>
                <Button
                  ref={labelRef}
                  className="text-[#8c8c88] hover:bg-white/[0.06] hover:text-[#f4f2ed]"
                  tooltip={t('header.display.label')}
                  shortcut="L"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onClick={() => {
                    openDialog('commandPalette', { pages: ['LABEL'] });
                    trackEvent('label_dialog_opened', { thread_id: thread.id });
                  }}
                  disabled={!thread}
                  data-keyboard-item="label"
                >
                  <MonoIcon type="Label" />
                </Button>
                {thread.labelIds.includes('STARRED') ? (
                  <Button
                    ref={starRef}
                    className="text-[#8c8c88] hover:bg-white/[0.06] hover:text-[#f4f2ed]"
                    tooltip={t('header.display.unstar')}
                    shortcut="SHIFT+S"
                    sizeVariant="sm"
                    variant="ghost"
                    typeVariant="icon"
                    onClick={handleUnstarThread}
                    data-keyboard-item="star-toggle"
                  >
                    <MonoIcon type="Star" className="h-4 w-4 text-yellow-500" />
                  </Button>
                ) : (
                  <Button
                    ref={starRef}
                    className="text-[#8c8c88] hover:bg-white/[0.06] hover:text-[#f4f2ed]"
                    tooltip={t('header.display.star')}
                    shortcut="S"
                    sizeVariant="sm"
                    variant="ghost"
                    typeVariant="icon"
                    onClick={handleStarThread}
                    data-keyboard-item="star-toggle"
                  >
                    <MonoIcon type="Star" className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  ref={doneRef}
                  className={cn(
                    'hover:bg-white/[0.06]',
                    !thread?.labelIds.includes('INBOX')
                      ? 'text-green-500'
                      : 'text-[#8c8c88] hover:text-[#f4f2ed]'
                  )}
                  tooltip={t('header.display.done')}
                  shortcut="E"
                  sizeVariant="sm"
                  variant="ghost"
                  typeVariant="icon"
                  onClick={thread?.labelIds.includes('INBOX') ? handleDone : handleUnDone}
                  disabled={!thread}
                  data-keyboard-item="done-toggle"
                >
                  <MonoIcon type="CheckCircle" />
                </Button>
              </div>
            )}

            {/* Labels / badges — absolute right */}
            {thread && (
              <div className="absolute right-4 flex items-center gap-2">
                {thread.labelIds.some((label) => label.includes('Label_')) && (
                  <div className="flex items-center gap-1">
                    {uniqueLabelIds.map((labelId) => {
                      const label = threadLabels[labelId];
                      return label && label.name.length > 0 ? (
                        <Badge
                          key={labelId}
                          className={cn('rounded-sm')}
                          style={{
                            color: label.color.textColor || '',
                            backgroundColor: label.color.backgroundColor || ''
                          }}
                          onClick={() => {
                            openDialog('commandPalette', { pages: ['LABEL'] });
                            trackEvent('label_dialog_opened', { thread_id: thread.id });
                          }}
                          sizeVariant={'xs'}
                        >
                          <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                            <span className="whitespace-nowrap">
                              {label.name.replace('Mono/', '')}
                            </span>
                          </div>
                          <Button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRemoveLabel(labelId);
                            }}
                            className="ml-2 shrink-0 text-primary-foreground hover:text-primary-foreground"
                            style={{ color: label.color.textColor || '' }}
                            variant={'text'}
                            typeVariant={'inline'}
                          >
                            <MonoIcon type={'X'} className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
                {thread.labelIds.includes('TRASH') && (
                  <Badge className={cn('rounded-sm')} sizeVariant={'xs'}>
                    <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                      <span className="whitespace-nowrap">In Trash</span>
                    </div>
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

DisplayPanelHeader.displayName = 'DisplayPanelHeader';

export default DisplayPanelHeader;
