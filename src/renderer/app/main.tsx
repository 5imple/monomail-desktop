import { TooltipProvider } from '@/renderer/app/components/ui/tooltip';
import { HotkeyScopeProvider } from '@/renderer/app/context/HotkeyScopeContext';
import { MessageProvider } from '@/renderer/app/context/MessageContext';
import { SyncHistoryProvider } from '@/renderer/app/context/SyncHistoryContext';
import { UndoProvider } from '@/renderer/app/lib/commands/useUndoManager';
import InternetConnection from '@/renderer/app/middlewares/InternetConnection';
// Inter and IBM Plex Mono ship with the app (no fonts.googleapis.com round
// trip): bundled by Vite and served from the app itself, so text renders in
// the right face on the first frame, offline too.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@/renderer/app/tippy.css';
import '@/renderer/assets/locales';
import '@/renderer/global.css';
// react-scan is a dev tool that instruments React internals. It must not
// ship to production — gate the side-effecting import behind DEV mode.
if (import.meta.env.DEV) {
  import('@/renderer/utils/reactScan');
}
import ReactDOM from 'react-dom/client';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { BrowserRouter, HashRouter } from 'react-router-dom';

// When the renderer is loaded from a non-http(s) URL (the standalone .app
// path where the bundled renderer is served via the custom `monomail-app://`
// scheme, or any file:// fallback), pushState-based routing is fragile —
// reloads or deep-links don't resolve cleanly. Auto-fall-back to a hash
// router for those origins. Hosted browser builds keep BrowserRouter so
// URLs stay clean.
const Router =
  typeof window !== 'undefined' &&
  window.location.protocol !== 'http:' &&
  window.location.protocol !== 'https:'
    ? HashRouter
    : BrowserRouter;
import AppRouter from './AppRouter';
import AppErrorBoundary from './components/AppErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import './global.css';
import RouteLogger from './middlewares/RouteLogger';
import { KeyboardNavigationProvider } from '@/renderer/app/context/KeyboardNavigationContext';
import { CommandRunnerProvider } from '@/renderer/app/lib/commands/useExcuteCommands';
import { SyncThreadProvider } from '@/renderer/app/context/SyncThreadContext';
import { initializeServiceWorker, initializeNetworkMonitoring } from '@/renderer/app/lib/pwa';
import { isElectron } from '@/renderer/app/lib/electronApi';

// The PWA service worker is for the web build only. In the desktop app the
// custom scheme doesn't allow service workers, and in dev / http it put
// NetworkFirst timeouts in front of the app's own assets.
if (!isElectron) {
  initializeServiceWorker();
}

// Initialize network monitoring for better offline/online detection
initializeNetworkMonitoring();

const careers = import.meta.env.MONO_ENV_CAREERS_URL?.trim();
const appVersion = import.meta.env.MONO_ENV_APP_VERSION || '1.0.0-dev';
const logo = `
  __  __                     __  __       _ _ 
 |  \\/  | ___  _ __   ___   |  \\/  | __ _(_) |
 | |\\/| |/ _ \\| '_ \\ / _ \\  | |\\/| |/ _\` | | |
 | |  | | (_) | | | | (_) | | |  | | (_| | | |
 |_|  |_|\\___/|_| |_|\\___/  |_|  |_|\\__,_|_|_| v${appVersion}
${careers ? `\n  ${careers}` : ''}
`;

console.info(logo);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider defaultTheme={'pure-light'} storageKey="ui-theme">
    {/* Outermost boundary short of the theme: a crash inside any provider
        (auth, sync, hotkeys…) still shows the recovery screen instead of a
        blank window. */}
    <AppErrorBoundary>
      <InternetConnection>
        <UndoProvider>
          <AuthProvider>
            <Router>
              <RouteLogger>
                <TooltipProvider delayDuration={300}>
                  <SyncHistoryProvider>
                    <SyncThreadProvider>
                      <MessageProvider>
                        <HotkeysProvider initiallyActiveScopes={['GLOBAL']}>
                          <HotkeyScopeProvider>
                            <KeyboardNavigationProvider>
                              <CommandRunnerProvider>
                                <Toaster />
                                <AppRouter />
                              </CommandRunnerProvider>
                            </KeyboardNavigationProvider>
                          </HotkeyScopeProvider>
                        </HotkeysProvider>
                      </MessageProvider>
                    </SyncThreadProvider>
                  </SyncHistoryProvider>
                </TooltipProvider>
              </RouteLogger>
            </Router>
          </AuthProvider>
        </UndoProvider>
      </InternetConnection>
    </AppErrorBoundary>
  </ThemeProvider>
);
