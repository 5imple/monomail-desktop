import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import StatusIndicator from '@/renderer/app/components/StatusIndicator';
import { Button } from '@/renderer/app/components/ui/button';
import DialogManager from '@/renderer/app/containers/dialog/DialogManager';
import AppCalendarPanelContainer from '@/renderer/app/containers/sidebar/AppCalendarPanelContainer';
import AppMainPanelContainer from '@/renderer/app/containers/sidebar/AppMainPanelContainer';
import AppSidebarContainer from '@/renderer/app/containers/sidebar/AppSidebarContainer';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import MailNavTabs from '@/renderer/app/containers/header/MailNavTabs';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useRegisterHotkeys } from '@/renderer/app/hooks/useRegisterHotkeys';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { useThreadAtom } from '@/renderer/app/store/thread/useThreadAtom';
import { CommandType } from '@/renderer/app/types';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

interface AppLayoutProps {}

const AppLayout: FC<AppLayoutProps> = ({}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const threadIdParam = searchParams.get('tid');
  const { gmailStatusInvalid, calendarDisplayPanel, setCalendarDisplayPanel } = useGlobalAtom();
  const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
  const { setActiveThreadId } = useThreadAtom();
  const [isLoaded, setIsLoaded] = useState(false);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const { accounts } = useAuth();
  const executeCommand = useExecuteCommand();
  const { openDialog } = useDialogs();
  useRegisterHotkeys();

  useEffect(() => {
    if (threadIdParam) {
      setActiveThreadId(threadIdParam);
    }
  }, [setActiveThreadId, threadIdParam]);

  useEffect(() => {
    const handleCommandTrigger = (commandId: CommandType) => {
      executeCommand(commandId);
    };

    electronApi.mainLayoutReady();

    const removeTriggerListener = electronApi.on('renderer:command:trigger', handleCommandTrigger);

    return () => {
      removeTriggerListener();
    };
  }, []);

  useEffect(() => {
    const removeListener = electronApi.on('renderer:mailto:compose', ({ email, params }) => {
      if (!accounts[0]) return;

      const draft = new MonoDraft({
        from: accounts[0].email,
        to: email ? [email] : [],
        cc: params.cc ? params.cc.split(',') : [],
        bcc: params.bcc ? params.bcc.split(',') : [],
        subject: params.subject || '',
        body: params.body || ''
      });

      executeCommand('COMPOSE_NEW_MESSAGE', { draft });
    });
    return () => {
      removeListener();
    };
  }, [accounts]);

  // Proper loading animation with slight delay
  useEffect(() => {
    // Wait for sidebar state to be loaded before showing UI
    if (!sidebarLoading) {
      // Use requestAnimationFrame for smooth initial render
      requestAnimationFrame(() => {
        setIsLoaded(true);
      });
    }
  }, [sidebarLoading]);

  useEffect(() => {
    if (isLoaded) {
      setStartupTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setStartupTimedOut(true);
    }, 3500);

    return () => clearTimeout(timer);
  }, [isLoaded]);

  return (
    <>
      <div
        className={cn(
          'no-drag h-screen bg-gradient-to-tr from-background/90 to-background/80 backdrop-blur-lg'
        )}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {/* Unified titlebar — spans the full window width. `drag` allows
              window dragging across the whole strip; each nav button carries
              `no-drag` so clicks still fire. Traffic lights sit at x=12,y=16
              so we reserve pl-20 on the left to avoid overlapping them. */}
          <div className="drag relative z-50 flex h-11 w-full shrink-0 items-center bg-background pl-20 pr-4">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto">
                <MailNavTabs />
              </div>
            </div>
            <div className="no-drag absolute right-4 flex items-center gap-1">
              <Button
                variant="ghost"
                typeVariant="icon"
                sizeVariant="xxs"
                tooltip="Compose"
                onClick={() => executeCommand('COMPOSE_NEW_MESSAGE')}
              >
                <MonoIcon type="Edit" className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                typeVariant="icon"
                sizeVariant="xxs"
                tooltip="Accounts"
                onClick={() => openDialog('preference', { defaultPage: 'integration' })}
              >
                <MonoIcon type="UserIcon" className="h-3 w-3 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                typeVariant="icon"
                sizeVariant="xxs"
                tooltip={calendarDisplayPanel ? 'Hide calendar' : 'Show calendar'}
                onClick={() => setCalendarDisplayPanel(!calendarDisplayPanel)}
              >
                <MonoIcon
                  type="Calendar"
                  className={cn('h-3 w-3', calendarDisplayPanel ? 'text-foreground' : 'text-muted-foreground')}
                />
              </Button>
            </div>
          </div>
          <div className="relative flex flex-1 overflow-hidden">
            {/* Remove individual transition classes - inherit from parent */}
            <AppSidebarContainer
              className={cn(
                'transition-opacity duration-300 ease-out',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />
            <AppMainPanelContainer
              className={cn(
                'transition-opacity duration-300 ease-out',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />

            {/* Calendar panel — mirrors sidebar motion: spacer controls layout, absolute panel slides */}
            <div className="relative">
              {/* Spacer: expands/collapses to push main panel */}
              <div
                className={cn(
                  'h-full shrink-0',
                  !sidebarLoading && 'transition-[width] duration-300 ease-bouncy-in-out',
                  calendarDisplayPanel ? 'w-[388px]' : 'w-0'
                )}
              />
              {/* Panel: always mounted, slides in/out from the right */}
              <div
                className={cn(
                  'absolute right-0 top-0 h-full w-[388px]',
                  !sidebarLoading && 'transition-all duration-300 ease-bouncy-in-out',
                  calendarDisplayPanel ? 'translate-x-0' : 'translate-x-[388px]',
                  !calendarDisplayPanel && 'pointer-events-none'
                )}
              >
                <AppCalendarPanelContainer
                  className={cn(
                    'transition-opacity duration-300 ease-out',
                    isLoaded ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </div>
            </div>
            {!isLoaded && startupTimedOut && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-md border bg-card/95 p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-md bg-destructive/10 p-2 text-destructive">
                      <MonoIcon type="AlertCircle" className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-base font-medium">Mono Mail is still loading</h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        The window opened, but the mail shell did not become ready.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      sizeVariant="sm"
                      onClick={() => {
                        window.location.reload();
                      }}
                    >
                      Reload
                    </Button>
                    {isElectron && (
                      <Button
                        type="button"
                        sizeVariant="sm"
                        variant="secondary"
                        onClick={() => {
                          void electronApi.openLogFolder();
                        }}
                      >
                        Open Logs
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <StatusIndicator />
        </div>
        <SidebarCollapseButton
          className={cn(
            'no-drag fixed top-[8px] z-50',
            sidebarCollapsed ? 'left-20' : 'left-[178px]',
            isElectron ?? 'hidden'
            // Remove opacity transition - inherits from parent
          )}
        />
      </div>
      <DialogManager />
    </>
  );
};

export default AppLayout;
