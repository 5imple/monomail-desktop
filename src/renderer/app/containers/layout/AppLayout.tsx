import { MonoDraft } from '@/main/models/draft/MonoDraft';
import StatusIndicator from '@/renderer/app/components/StatusIndicator';
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
