import { MonoDraft } from '@/main/models/draft/MonoDraft';
import GlobalComposeCard from '@/renderer/app/components/card/compose/GlobalComposeCard';
import InboxIcon from '@/renderer/app/components/icons/InboxIcon';
import OfflineIndicator from '@/renderer/app/components/OfflineIndicator';
import StatusIndicator from '@/renderer/app/components/StatusIndicator';
import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import DialogManager from '@/renderer/app/containers/dialog/DialogManager';
import AppCalendarPanelContainer from '@/renderer/app/containers/sidebar/AppCalendarPanelContainer';
import AppMainPanelContainer from '@/renderer/app/containers/sidebar/AppMainPanelContainer';
import AppSidebarContainer from '@/renderer/app/containers/sidebar/AppSidebarContainer';
import SidebarCollapseButton from '@/renderer/app/containers/sidebar/SidebarCollapseButton';
import MailNavTabs from '@/renderer/app/containers/header/MailNavTabs';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useAccountErrors } from '@/renderer/app/hooks/useAccountErrors';
import { useRegisterHotkeys } from '@/renderer/app/hooks/useRegisterHotkeys';
import { useReaderReturn } from '@/renderer/app/store/layout/readerReturnAtom';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { useComposeWindowAtom } from '@/renderer/app/store/compose/useComposeWindowAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useSidebarAtom } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { calendarDisplayPanelAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { activeThreadIdAtom, selectedThreadsAtom } from '@/renderer/app/store/thread/atoms';
import { CommandType } from '@/renderer/app/types';
import { useAtom, useSetAtom, useStore } from 'jotai';
import { CalendarDays, CircleUserRound, SquarePen } from 'lucide-react';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

interface AppLayoutProps {}

const TITLEBAR_ACTION_ICON_CLASS = 'h-[17px] w-[17px]';
const TITLEBAR_ACTION_ICON_STROKE_WIDTH = 1.8;

// mailto: allows several comma-separated addresses per field (RFC 6068).
const splitAddresses = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);

type MailtoPayload = { email?: string; params: Record<string, string | undefined> };

/**
 * The app-wide keyboard shortcuts. A component of its own (rendering nothing)
 * because the hotkeys read the thread store and the command table: in the
 * layout itself they re-rendered the whole app on every thread change.
 */
const GlobalHotkeys: FC = () => {
  useRegisterHotkeys();
  // Also here, for the same reason: closing an email opened from Later goes
  // back to Later (readerReturnAtom).
  useReaderReturn();
  return null;
};

const AppLayout: FC<AppLayoutProps> = ({}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const threadIdParam = searchParams.get('tid');
  const [calendarDisplayPanel, setCalendarDisplayPanel] = useAtom(calendarDisplayPanelAtom);
  const { sidebarCollapsed, sidebarLoading } = useSidebarAtom();
  const { globalDraftWindows } = useComposeWindowAtom();
  // Setters and on-demand reads only: subscribing the layout to the open
  // thread or the selection re-rendered everything under it.
  const store = useStore();
  const setActiveThreadId = useSetAtom(activeThreadIdAtom);
  const setSelectedThreads = useSetAtom(selectedThreadsAtom);
  const [isLoaded, setIsLoaded] = useState(false);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const [startupSlow, setStartupSlow] = useState(false);
  const { accounts } = useAuth();
  const accountErrors = useAccountErrors();
  const executeCommand = useExecuteCommand();
  const { openDialog } = useDialogs();

  useEffect(() => {
    if (threadIdParam) {
      setActiveThreadId(threadIdParam);
    }
  }, [setActiveThreadId, threadIdParam]);

  // Escape returns to the previous view: close the open email (back to the
  // list), or on the list clear the selection. Dialogs/menus handle their own Escape (Radix), and we don't hijack
  // it while the user is typing in a field. Capture phase so we can read the
  // still-open dialog state before Radix dismisses it.
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;

      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable)
      ) {
        return;
      }

      // An open dialog/menu owns Escape — let it close instead of navigating.
      // So does the expanded compose: the reader / selection under it is out
      // of sight and must not change.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"], [data-compose-expanded="true"]'
        )
      ) {
        return;
      }

      if (store.get(activeThreadIdAtom)) {
        e.preventDefault();
        setActiveThreadId(null);
      } else if (store.get(selectedThreadsAtom).length > 0) {
        // Back on the list, Escape clears a multi-selection.
        e.preventDefault();
        setSelectedThreads([]);
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [store, setActiveThreadId, setSelectedThreads]);

  // The trigger listener below is registered once, so read the latest
  // executeCommand through a ref. Capturing it directly froze the command
  // table at first render: tray "Compose Message" kept the initial (possibly
  // still-empty) account list and told signed-in users to connect Gmail.
  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  useEffect(() => {
    const handleCommandTrigger = (commandId: CommandType) => {
      executeCommandRef.current(commandId).catch((error) => {
        console.error(`[AppLayout] command ${commandId} failed`, error);
      });
    };

    electronApi.mainLayoutReady();

    const removeTriggerListener = electronApi.on('renderer:command:trigger', handleCommandTrigger);

    return () => {
      removeTriggerListener();
    };
  }, []);

  // A mailto: link opened before the accounts load is held (latest one only)
  // and composed once they arrive.
  const pendingMailtoRef = useRef<MailtoPayload | null>(null);
  const composeFromMailto = useCallback(
    ({ email, params }: MailtoPayload) => {
      const account = accounts.find((a) => !a.isExpired) ?? accounts[0];
      if (!account) {
        pendingMailtoRef.current = { email, params };
        return;
      }

      const draft = new MonoDraft({
        from: account.email,
        to: splitAddresses(email),
        cc: splitAddresses(params.cc),
        bcc: splitAddresses(params.bcc),
        subject: params.subject || '',
        body: params.body || ''
      });

      executeCommand('COMPOSE_NEW_MESSAGE', { draft });
    },
    [accounts, executeCommand]
  );

  useEffect(() => {
    const removeListener = electronApi.on('renderer:mailto:compose', composeFromMailto);
    return () => {
      removeListener();
    };
  }, [composeFromMailto]);

  useEffect(() => {
    const pending = pendingMailtoRef.current;
    if (pending && accounts.length > 0) {
      pendingMailtoRef.current = null;
      composeFromMailto(pending);
    }
  }, [accounts, composeFromMailto]);

  // The panels fade in over 100 ms once the sidebar state is known (it was
  // 300 ms, on top of the wait). The placeholder before this (AuthGuard)
  // already draws the same chrome, so nothing jumps.
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
      setStartupSlow(false);
      setStartupTimedOut(false);
      return;
    }

    // A quiet spinner only once loading is noticeably slow (normal launches
    // never flash it), then the recovery card.
    const slowTimer = setTimeout(() => {
      setStartupSlow(true);
    }, 400);
    const timer = setTimeout(() => {
      setStartupTimedOut(true);
    }, 3500);

    return () => {
      clearTimeout(slowTimer);
      clearTimeout(timer);
    };
  }, [isLoaded]);

  const accountsLabel =
    accountErrors.length > 0
      ? t('layout.titlebar.accounts_attention', {
          defaultValue: 'Reconnect {{emails}} — open Accounts',
          emails: accountErrors.map(({ account }) => account.email).join(', ')
        })
      : t('layout.titlebar.accounts', { defaultValue: 'Accounts' });

  return (
    <>
      <GlobalHotkeys />
      <div className={cn('no-drag h-screen bg-white dark:bg-background')}>
        <div className="flex h-full flex-col overflow-hidden">
          {/* Unified titlebar — spans the full window width. `drag` allows
              window dragging across the whole strip; each nav button carries
              `no-drag` so clicks still fire. Traffic lights sit at x=12,y=16
              so we reserve an explicit left gutter to avoid rem-scale drift. */}
          <div className="drag relative z-50 flex h-[52px] w-full shrink-0 items-center bg-white pl-[92px] pr-[16px] dark:bg-background">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* Dimmed while the expanded compose covers the mail view. */}
              <div className="pointer-events-auto transition-opacity [body:has([data-compose-expanded=true])_&]:opacity-50">
                <MailNavTabs />
              </div>
            </div>
            <div className="no-drag absolute right-[16px] flex items-center gap-[6px]">
              <OfflineIndicator />
              {/* Compose says so in words: a pen alone, among three identical
                  grey icons, didn't read as "write a new email". The word
                  gives way to the icon in a narrow window. */}
              <Button
                variant="ghost"
                sizeVariant="sm"
                className="h-[32px] gap-[6px] rounded-[7px] px-[10px] text-[13px] font-medium text-foreground hover:bg-foreground/[0.07] max-[900px]:w-[36px] max-[900px]:px-0"
                tooltip={t('layout.titlebar.compose', { defaultValue: 'Compose' })}
                shortcut="C"
                onClick={() => executeCommand('COMPOSE_NEW_MESSAGE')}
              >
                <SquarePen
                  className={TITLEBAR_ACTION_ICON_CLASS}
                  strokeWidth={TITLEBAR_ACTION_ICON_STROKE_WIDTH}
                  aria-hidden="true"
                />
                <span className="max-[900px]:sr-only">
                  {t('layout.titlebar.compose', { defaultValue: 'Compose' })}
                </span>
              </Button>
              <Button
                variant="ghost"
                typeVariant="icon"
                sizeVariant="sm"
                className="relative h-[36px] w-[36px] text-muted-foreground hover:text-foreground"
                aria-label={accountsLabel}
                tooltip={
                  accountErrors.length > 0 ? (
                    <div className="space-y-1">
                      {accountErrors.map(({ account, reason }) => (
                        <div key={account.uid}>
                          <div className="font-medium">{account.email}</div>
                          <div className="opacity-80">{reason}</div>
                        </div>
                      ))}
                      <div className="opacity-80">
                        {t('layout.titlebar.accounts_open_hint', {
                          defaultValue: 'Click to open Accounts'
                        })}
                      </div>
                    </div>
                  ) : (
                    accountsLabel
                  )
                }
                onClick={() => openDialog('preference', { defaultPage: 'integration' })}
              >
                <CircleUserRound
                  className={TITLEBAR_ACTION_ICON_CLASS}
                  strokeWidth={TITLEBAR_ACTION_ICON_STROKE_WIDTH}
                  aria-hidden="true"
                />
                {accountErrors.length > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background"
                  />
                )}
              </Button>
              <Button
                variant="ghost"
                typeVariant="icon"
                sizeVariant="sm"
                className={cn(
                  'h-[36px] w-[36px]',
                  'hover:text-foreground',
                  calendarDisplayPanel ? 'text-foreground' : 'text-muted-foreground'
                )}
                tooltip={
                  calendarDisplayPanel ? t('calendar.hide_calendar') : t('calendar.show_calendar')
                }
                aria-pressed={calendarDisplayPanel}
                onClick={() => setCalendarDisplayPanel(!calendarDisplayPanel)}
              >
                <CalendarDays
                  className={TITLEBAR_ACTION_ICON_CLASS}
                  strokeWidth={TITLEBAR_ACTION_ICON_STROKE_WIDTH}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
          <div className="relative flex flex-1 overflow-hidden">
            {/* Remove individual transition classes - inherit from parent */}
            <AppSidebarContainer
              className={cn(
                'transition-opacity duration-100 ease-out',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />
            <AppMainPanelContainer
              className={cn(
                'transition-opacity duration-100 ease-out',
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
                  // `flex` is required: the child container uses `flex flex-1` to fill
                  // this panel's height. Without it, the child collapses to content
                  // height and h-full breaks all the way down to the calendar grid's
                  // ScrollArea — which then can't scroll.
                  'absolute right-0 top-0 flex h-full w-[388px]',
                  !sidebarLoading && 'transition-all duration-300 ease-bouncy-in-out',
                  calendarDisplayPanel ? 'translate-x-0' : 'translate-x-[388px]',
                  // `invisible` flips after the slide-out (transition-all), taking the
                  // hidden calendar out of the Tab order and the accessibility tree.
                  !calendarDisplayPanel && 'pointer-events-none invisible'
                )}
              >
                <AppCalendarPanelContainer
                  className={cn(
                    'transition-opacity duration-100 ease-out',
                    isLoaded ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </div>
            </div>
            {globalDraftWindows.map((draft) => (
              <GlobalComposeCard key={draft.id} draft={draft} />
            ))}
            {!isLoaded && startupSlow && !startupTimedOut && (
              <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center duration-300 animate-in fade-in-0">
                <Loader />
              </div>
            )}
            {!isLoaded && startupTimedOut && (
              <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-md border bg-card/95 p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-md bg-muted p-2 text-muted-foreground">
                      <InboxIcon type="AlertCircle" className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 className="text-base font-medium">
                        {t('layout.startup.slow_title', {
                          defaultValue: 'Taking longer than usual…'
                        })}
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('layout.startup.slow_description', {
                          defaultValue:
                            'Mono Mail is still getting ready. Reload if it doesn’t open in a moment.'
                        })}
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
                      {t('layout.startup.reload', { defaultValue: 'Reload' })}
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
                        {t('layout.startup.open_logs', { defaultValue: 'Open logs' })}
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
            sidebarCollapsed ? 'left-[92px]' : 'left-[178px]',
            // Only the expanded compose covers it; a minimized compose doesn't.
            '[body:has([data-compose-expanded=true])_&]:hidden'
          )}
        />
      </div>
      <DialogManager />
    </>
  );
};

export default AppLayout;
