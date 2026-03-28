import { MonoThread } from '@/main/models/thread/MonoThread';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { NotificationBadge } from '@/renderer/app/components/ui/notification-badge';
import LinkShareDropdownItem from '@/renderer/app/containers/dropdown/LinkShareDropdownItem';
import { useHotkeyScope } from '@/renderer/app/context/HotkeyScopeContext';
import { useKeyboardNavigationContext } from '@/renderer/app/context/KeyboardNavigationContext';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { isElectron } from '@/renderer/app/lib/electronApi';
import { highlightThreadText } from '@/renderer/app/lib/highlightThreadText';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useSharedAtom } from '@/renderer/app/store/shared/useSharedAtom';
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
  contactToggle: boolean;
  handleContactToggle: () => void;
}

const DisplayPanelHeader = forwardRef<HTMLDivElement, DisplayPanelHeaderProps>(
  ({ thread, handlePrint, isPrinting, handleContactToggle, contactToggle }, ref) => {
    const { setSelectedThreads } = useThreadAtom();
    const { removeLabelFromThread } = useThreadLabelAtom();
    const { t } = useTranslation();
    const { activateScope, deactivateScope, activeScopes } = useHotkeyScope();
    const { globalSearchQuery, setFullscreenDisplayPanel, fullscreenDisplayPanel } =
      useGlobalAtom();
    const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
    const { openDialog } = useDialogs();
    const executeCommand = useExecuteCommand();
    const { trackEvent } = useUserTrackingData();
    const { isItemPublished } = useSharedAtom();
    const { labelsMapByAccount } = useLabelAtom();

    // Keyboard navigation
    const { registerItem, unregisterItem, registerAreaRef } = useKeyboardNavigationContext();

    // Refs for keyboard navigation
    const headerContainerRef = useRef<HTMLDivElement>(null);
    const closePanelRef = useRef<HTMLButtonElement>(null);
    const fullscreenRef = useRef<HTMLButtonElement>(null);
    const contactsRef = useRef<HTMLButtonElement>(null);
    const shareRef = useRef<HTMLButtonElement>(null);
    const reminderRef = useRef<HTMLButtonElement>(null);
    const labelRef = useRef<HTMLButtonElement>(null);
    const starRef = useRef<HTMLButtonElement>(null);
    const doneRef = useRef<HTMLButtonElement>(null);
    const trashRef = useRef<HTMLButtonElement>(null);

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
          { id: 'contacts-toggle', ref: contactsRef.current },
          { id: 'share-thread', ref: shareRef.current },
          { id: 'reminder', ref: reminderRef.current },
          // { id: 'label', ref: labelRef.current },
          { id: 'star-toggle', ref: starRef.current },
          { id: 'done-toggle', ref: doneRef.current },
          { id: 'trash-toggle', ref: trashRef.current }
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

    const highlightedContent = useMemo(() => {
      if (!thread || !globalSearchQuery) {
        return {
          subject: null,
          snippet: null
        };
      }

      return {
        subject: highlightThreadText(
          !thread.subject || thread.subject === '' ? '(No subject)' : thread.subject,
          globalSearchQuery
        ),
        snippet: thread.snippet ? highlightThreadText(thread.snippet, globalSearchQuery) : null
      };
    }, [thread?.subject, thread?.snippet, globalSearchQuery]);

    const handleDone = async () => {
      if (thread) {
        executeCommand('THREAD_DONE');
        trackEvent('thread_doned', {
          thread_id: thread.id
        });
      }
    };
    const handleUnDone = async () => {
      if (thread) {
        executeCommand('THREAD_UNDONE');
        trackEvent('thread_undoned', {
          thread_id: thread.id
        });
      }
    };

    const handleStarThread = async () => {
      if (thread) {
        executeCommand('THREAD_STAR');
        trackEvent('thread_starred', { thread_id: thread.id });
      }
    };

    const handleUnstarThread = async () => {
      if (thread) {
        executeCommand('THREAD_UNSTAR');
        trackEvent('thread_unstarred', { thread_id: thread.id });
      }
    };

    const handleTrashThread = async () => {
      if (thread) {
        executeCommand('THREAD_TRASH');
        trackEvent('thread_trashed', { thread_id: thread.id });
      }
    };

    const handleUntrashThread = async () => {
      if (thread) {
        executeCommand('THREAD_UNTRASH');
        trackEvent('thread_untrashed', { thread_id: thread.id });
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
        setSelectedThreads([]);
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
      'MOD+ENTER',
      togglePanelFullscreen,
      { preventDefault: true, enabled: isNavigationEnabled(), scopes: ['CONVERSATION_DISPLAY'] },
      [togglePanelFullscreen]
    );
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
            className={cn('flex p-2')}
            data-focusable-area="display-header"
          >
            <div
              className={cn(
                'flex items-center gap-1',
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
              <Button
                ref={fullscreenRef}
                className="text-muted-foreground hover:text-foreground"
                tooltip={
                  fullscreenDisplayPanel ? t('header.display.shrink') : t('header.display.expand')
                }
                variant="ghost"
                shortcut="MOD+ENTER"
                sizeVariant="sm"
                typeVariant="icon"
                onClick={togglePanelFullscreen}
                data-keyboard-item="fullscreen-toggle"
              >
                <MonoIcon type={fullscreenDisplayPanel ? 'Minimize' : 'Maximize'} />
              </Button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="mr-2 flex h-full items-center gap-1">
                {thread && thread.labelIds.some((label) => label.includes('Label_')) && (
                  <div className="flex items-center gap-1">
                    {thread.labelIds
                      .filter((label) => label.includes('Label_'))
                      .map((labelId, index) => {
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
                              trackEvent('label_dialog_opened', {
                                thread_id: thread.id
                              });
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
                              style={{
                                color: label.color.textColor || ''
                              }}
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
              </span>

              {thread && thread.labelIds.includes('TRASH') && (
                <Badge className={cn('rounded-sm')} sizeVariant={'xs'}>
                  <div className="no-drag flex-1 overflow-hidden text-ellipsis">
                    <span className="whitespace-nowrap">In Trash</span>
                  </div>
                </Badge>
              )}

              {thread && (
                <div className="relative">
                  <Button
                    ref={contactsRef}
                    className="text-muted-foreground"
                    tooltip={t('header.display.contacts')}
                    sizeVariant="sm"
                    variant="ghost"
                    typeVariant="icon"
                    onClick={handleContactToggle}
                    data-keyboard-item="contacts-toggle"
                  >
                    <MonoIcon type={'Id'} className={cn(contactToggle && 'text-foreground')} />
                  </Button>

                  {contactToggle && (
                    <NotificationBadge
                      dot
                      variant={'default'}
                      size="sm"
                      className="absolute right-0.5 top-0.5"
                    />
                  )}
                </div>
              )}
              {thread && thread.id.length < 20 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div className="relative">
                        <Button
                          ref={shareRef}
                          className={cn(
                            'hover:text-foreground',
                            isItemPublished(thread.accountId, thread.id, 'thread')
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          )}
                          tooltip={t('header.display.share_thread')}
                          sizeVariant="sm"
                          variant="ghost"
                          typeVariant="icon"
                          data-keyboard-item="share-thread"
                        >
                          <MonoIcon type="Share" />
                        </Button>
                        {isItemPublished(thread.accountId, thread.id, 'thread') && (
                          <NotificationBadge
                            dot
                            variant={'default'}
                            size="sm"
                            className="absolute right-0.5 top-0.5"
                          />
                        )}
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <LinkShareDropdownItem
                        type={'thread'}
                        accountId={thread.accountId}
                        itemId={thread.id}
                      />
                      <DropdownMenuItem disabled={true} onClick={() => {}}>
                        <MonoIcon type={'Slack'} className="mr-2 h-3.5 w-3.5" />
                        {t('header.display.send_to_slack')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    ref={reminderRef}
                    className="text-muted-foreground"
                    tooltip={t('header.display.reminder')}
                    shortcut="H"
                    sizeVariant="sm"
                    variant="ghost"
                    typeVariant="icon"
                    onClick={() => {
                      openDialog('commandPalette', { pages: ['REMINDER'] });
                      trackEvent('reminder_opened', {
                        thread_id: thread.id
                      });
                    }}
                    disabled={!thread}
                    data-keyboard-item="reminder"
                  >
                    <MonoIcon type="Clock" />
                  </Button>
                  <Button
                    ref={labelRef}
                    className="text-muted-foreground"
                    tooltip={t('header.display.label')}
                    shortcut="L"
                    sizeVariant="sm"
                    variant="ghost"
                    typeVariant="icon"
                    onClick={() => {
                      openDialog('commandPalette', { pages: ['LABEL'] });
                      trackEvent('label_dialog_opened', {
                        thread_id: thread.id
                      });
                    }}
                    disabled={!thread}
                    data-keyboard-item="label"
                  >
                    <MonoIcon type="Label" />
                  </Button>
                  {thread &&
                    (thread.labelIds.includes('STARRED') ? (
                      <Button
                        ref={starRef}
                        className="text-muted-foreground"
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
                        tooltip={t('header.display.star')}
                        shortcut="S"
                        sizeVariant="sm"
                        variant="ghost"
                        typeVariant="icon"
                        onClick={handleStarThread}
                        data-keyboard-item="star-toggle"
                      >
                        <MonoIcon
                          type="Star"
                          className="h-4 w-4 text-muted-foreground hover:text-yellow-500"
                        />
                      </Button>
                    ))}

                  <Button
                    ref={doneRef}
                    className={cn(
                      'text-muted-foreground hover:text-green-500',
                      !thread?.labelIds.includes('INBOX')
                        ? 'text-green-500'
                        : 'text-muted-foreground'
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

                  {thread && !thread.labelIds.includes('TRASH') ? (
                    <Button
                      ref={trashRef}
                      className="text-muted-foreground"
                      tooltip={t('header.display.trash')}
                      shortcut="Backspace"
                      sizeVariant="sm"
                      variant="ghost"
                      typeVariant="icon"
                      onClick={handleTrashThread}
                      data-keyboard-item="trash-toggle"
                    >
                      <MonoIcon type="Trash" className="" />
                    </Button>
                  ) : (
                    <Button
                      ref={trashRef}
                      className="text-muted-foreground"
                      tooltip={t('header.display.untrash')}
                      sizeVariant="sm"
                      variant="ghost"
                      typeVariant="icon"
                      onClick={handleUntrashThread}
                      data-keyboard-item="trash-toggle"
                    >
                      <MonoIcon type="TrashRestore" className="" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <div
            className="no-drag w-full cursor-auto select-text break-words px-5 pb-3 text-lg font-medium"
            dangerouslySetInnerHTML={{
              __html:
                !highlightedContent.subject || highlightedContent.subject === ''
                  ? '(No subject)'
                  : highlightedContent.subject
            }}
          ></div>
        </div>
      </div>
    );
  }
);

DisplayPanelHeader.displayName = 'DisplayPanelHeader';

export default DisplayPanelHeader;
