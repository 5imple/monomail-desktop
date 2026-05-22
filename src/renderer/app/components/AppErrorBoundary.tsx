import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import React from 'react';

interface AppErrorBoundaryState {
  error: Error | null;
}

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[AppErrorBoundary] renderer crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="no-drag flex h-screen items-center justify-center bg-gradient-to-tr from-background/90 to-background/80 p-6 backdrop-blur-lg">
        <div className="w-full max-w-md rounded-md border bg-card/95 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-md bg-destructive/10 p-2 text-destructive">
              <MonoIcon type="AlertCircle" className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-medium">Mono Mail could not render this window</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {this.state.error.message || 'Renderer error'}
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
    );
  }
}
