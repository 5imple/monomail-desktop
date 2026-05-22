import { MonoDraft } from '@/main/models/draft/MonoDraft';
import MonoIcon from '@/renderer/app/components/icons/icons';
import StatusIndicator from '@/renderer/app/components/StatusIndicator';
import { Button } from '@/renderer/app/components/ui/button';
import DialogManager from '@/renderer/app/containers/dialog/DialogManager';
import AppCalendarPanelContainer from '@/renderer/app/containers/sidebar/AppCalendarPanelContainer';
import AppMainPanelContainer from '@/renderer/app/containers/sidebar/AppMainPanelContainer';
import AppSidebarContainer from '@/renderer/app/containers/sidebar/AppSidebarContainer';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useRegisterHotkeys } from '@/renderer/app/hooks/useRegisterHotkeys';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
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
  const { gmailStatusInvalid, calendarDisplayPanel } = useGlobalAtom();
  const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
  const { setSelectedThreads, selectedThreads } = useThreadAtom();
  const [isLoaded, setIsLoaded] = useState(false);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const { accounts } = useAuth();
  const executeCommand = useExecuteCommand();
  useRegisterHotkeys();

  useEffect(() => {
    if (threadIdParam) {
      setSelectedThreads([threadIdParam]);
    }
  }, [threadIdParam]);

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
          <div className="relative flex h-full overflow-hidden">
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

            {calendarDisplayPanel && (
              <AppCalendarPanelContainer
                className={cn(
                  'transition-opacity duration-300 ease-out',
                  isLoaded ? 'opacity-100' : 'opacity-0'
                )}
              />
            )}
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
            'no-drag fixed left-20 top-[11px] z-50',
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
