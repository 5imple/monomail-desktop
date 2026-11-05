import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { getSupportEmail } from '@/renderer/app/lib/runtimeBranding';
import i18n from '@/renderer/assets/locales';
import log from 'electron-log';
import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

// Mounted just inside ThemeProvider (main.tsx), above every other provider, so
// it must not depend on any of them: no hooks, no tooltips, plain i18n.
export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[AppErrorBoundary] renderer crashed:', error, info.componentStack);
    // Also into the app log (main.log), where it can be read after the fact;
    // the console alone was lost unless someone copied the details.
    log.error(
      '[AppErrorBoundary] renderer crashed:',
      error?.stack ?? String(error),
      info.componentStack
    );
  }

  private copyDetails = () => {
    const { error } = this.state;
    if (!error) return;
    const details = [
      `${error.name}: ${error.message}`,
      error.stack,
      `App ${import.meta.env.MONO_ENV_APP_VERSION || 'dev'} · ${navigator.userAgent}`
    ]
      .filter(Boolean)
      .join('\n\n');
    void navigator.clipboard
      ?.writeText(details)
      .then(() => this.setState({ copied: true }))
      .catch(() => undefined);
  };

  render() {
    if (!this.state.error) return this.props.children;
    const t = i18n.t.bind(i18n);

    return (
      <div className="no-drag flex h-screen items-center justify-center bg-background p-6">
        {/* Frameless window: keep it movable while this screen is up. */}
        <div className="drag fixed inset-x-0 top-0 h-11" />
        <div className="w-full max-w-md rounded-md border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-md bg-muted p-2 text-muted-foreground">
              <MonoIcon type="AlertCircle" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-medium">
                {t('error_boundary.title', { defaultValue: 'Something went wrong' })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('error_boundary.description', {
                  defaultValue: 'Mono Mail hit an unexpected problem. Reloading usually fixes it.'
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              sizeVariant="sm"
              onClick={() => {
                window.location.reload();
              }}
            >
              {t('error_boundary.reload', { defaultValue: 'Reload' })}
            </Button>
            <Button type="button" sizeVariant="sm" variant="secondary" onClick={this.copyDetails}>
              {this.state.copied
                ? t('error_boundary.copied', { defaultValue: 'Copied' })
                : t('error_boundary.copy_details', { defaultValue: 'Copy details' })}
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
                {t('error_boundary.open_logs', { defaultValue: 'Open Logs' })}
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t('error_boundary.support', {
              defaultValue:
                'If this keeps happening, contact the Technology Services Center (TSC) at {{email}} or 410-778-7777.',
              email: getSupportEmail()
            })}
          </p>
        </div>
      </div>
    );
  }
}
