import { TooltipProvider } from '@/renderer/app/components/ui/tooltip';
import { HotkeyScopeProvider } from '@/renderer/app/context/HotkeyScopeContext';
import { MessageProvider } from '@/renderer/app/context/MessageContext';
import { SyncHistoryProvider } from '@/renderer/app/context/SyncHistoryContext';
import { UndoProvider } from '@/renderer/app/lib/commands/useUndoManager';
import InternetConnection from '@/renderer/app/middlewares/InternetConnection';
import '@/renderer/app/tippy.css';
import '@/renderer/assets/locales';
import '@/renderer/global.css';
// react-scan is a dev tool that instruments React internals. It must not
// ship to production — gate the side-effecting import behind DEV mode.
if (import.meta.env.DEV) {
  import('@/renderer/utils/reactScan');
}
import i18next from 'i18next';
import mixpanel from 'mixpanel-browser';
import ReactDOM from 'react-dom/client';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { BrowserRouter } from 'react-router-dom';
import AppRouter from './AppRouter';
import { ThemeProvider } from './components/ThemeProvider';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import './global.css';
import RouteLogger from './middlewares/RouteLogger';
import initializeAmplitude from '@/renderer/app/lib/amplitude';
import { KeyboardNavigationProvider } from '@/renderer/app/context/KeyboardNavigationContext';
import { SyncThreadProvider } from '@/renderer/app/context/SyncThreadContext';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';
import { initializeServiceWorker, initializeNetworkMonitoring } from '@/renderer/app/lib/pwa';

// Initialize Amplitude before rendering your app
if (!isDevelopment()) {
  mixpanel.init(import.meta.env.MONO_ENV_MIXPANEL_TOKEN, {
    debug: isDevelopment(),
    track_pageview: true,
    persistence: 'localStorage',
    // Honor Do-Not-Track. The previous `ignore_dnt: true` overrode the
    // user's browser-level opt-out, which is hostile-by-default for a
    // mail client.
    ignore_dnt: false
  });
  initializeAmplitude();
}
i18next.init({
  lng: 'en'
});

// Initialize Service Worker for Network First caching strategy
initializeServiceWorker();

// Initialize network monitoring for better offline/online detection
initializeNetworkMonitoring();

const careers = import.meta.env.MONO_ENV_CAREERS_URL?.trim();
const logo = `
  __  __                     __  __       _ _ 
 |  \\/  | ___  _ __   ___   |  \\/  | __ _(_) |
 | |\\/| |/ _ \\| '_ \\ / _ \\  | |\\/| |/ _\` | | |
 | |  | | (_) | | | | (_) | | |  | | (_| | | |
 |_|  |_|\\___/|_| |_|\\___/  |_|  |_|\\__,_|_|_| v${import.meta.env.MONO_ENV_APP_VERSION}
${careers ? `\n  ${careers}` : ''}
`;

console.info(logo);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider defaultTheme={'light'} storageKey="ui-theme">
    <InternetConnection>
      <UndoProvider>
        <AuthProvider>
          <BrowserRouter>
            <RouteLogger>
              <TooltipProvider delayDuration={300}>
                <SyncHistoryProvider>
                  <SyncThreadProvider>
                    <MessageProvider>
                      <KeyboardNavigationProvider>
                        <HotkeysProvider initiallyActiveScopes={['GLOBAL']}>
                          <HotkeyScopeProvider>
                            <Toaster />
                            <AppRouter />
                          </HotkeyScopeProvider>
                        </HotkeysProvider>
                      </KeyboardNavigationProvider>
                    </MessageProvider>
                  </SyncThreadProvider>
                </SyncHistoryProvider>
              </TooltipProvider>
            </RouteLogger>
          </BrowserRouter>
        </AuthProvider>
      </UndoProvider>
    </InternetConnection>
  </ThemeProvider>
);
