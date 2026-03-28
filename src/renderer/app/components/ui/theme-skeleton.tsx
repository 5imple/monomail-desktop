import { Separator } from '@/renderer/app/components/ui/separator';
import { cn } from '@/renderer/app/lib/utils';
import React, { FC } from 'react';

interface ThemeSkeletonProps {
  className?: string;
  type: 'dark' | 'light' | 'system' | 'compact' | 'cozy' | string;
}

const ThemeSkeleton: FC<ThemeSkeletonProps> = ({ className, type }) => {
  switch (type) {
    case 'dark':
      return (
        <div
          className={cn(
            'items-center rounded-lg border-muted bg-[#111111] p-1 hover:ring-2 hover:text-foreground',
            className
          )}
        >
          <div className="space-y-2 rounded-md bg-[#1f1f1f] p-2">
            <div className="space-y-2 rounded-md bg-[#262626] p-2 shadow-sm">
              <div className="h-2 w-[80px] rounded-lg bg-muted-foreground" />
              <div className="h-2 w-[100px] rounded-lg bg-muted-foreground" />
            </div>
            <div className="flex items-center space-x-2 rounded-md bg-[#262626] p-2 shadow-sm">
              <div className="h-4 w-4 rounded-full bg-muted-foreground" />
              <div className="h-2 w-[100px] rounded-lg bg-muted-foreground" />
            </div>
            <div className="flex items-center space-x-2 rounded-md bg-[#262626] p-2 shadow-sm">
              <div className="h-4 w-4 rounded-full bg-muted-foreground" />
              <div className="h-2 w-[100px] rounded-lg bg-muted-foreground" />
            </div>
          </div>
        </div>
      );

    case 'light':
      return (
        <div
          className={cn(
            'items-center rounded-lg border-muted p-1 hover:ring-2 hover:text-foreground',
            className
          )}
        >
          <div className="space-y-2 rounded-md bg-[#ecedef] p-2">
            <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
              <div className="h-2 w-[80px] rounded-lg bg-[#ecedef]" />
              <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
            </div>
            <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
              <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
              <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
            </div>
            <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
              <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
              <div className="h-2 w-[100px] rounded-lg bg-[#ecedef]" />
            </div>
          </div>
        </div>
      );
    case 'system':
      return (
        <div
          className={cn(
            'items-center rounded-lg border-2 border-muted bg-popover p-1 hover:bg-muted-low hover:text-foreground',
            className
          )}
        >
          <div className="flex">
            {/* Left half - Light theme */}
            <div className="w-1/2 space-y-2 rounded-l-md bg-[#ecedef] p-2">
              <div className="space-y-2 rounded-md bg-white p-2 shadow-sm">
                <div className="h-2 w-[40px] rounded-lg bg-[#ecedef]" />
                <div className="h-2 w-[50px] rounded-lg bg-[#ecedef]" />
              </div>
              <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                <div className="h-2 w-[30px] rounded-lg bg-[#ecedef]" />
              </div>
              <div className="flex items-center space-x-2 rounded-md bg-white p-2 shadow-sm">
                <div className="h-4 w-4 rounded-full bg-[#ecedef]" />
                <div className="h-2 w-[30px] rounded-lg bg-[#ecedef]" />
              </div>
            </div>
            {/* Right half - Dark theme */}
            <div className="w-1/2 space-y-2 rounded-r-md bg-slate-950 p-2">
              <div className="space-y-2 rounded-md bg-card p-2 shadow-sm">
                <div className="h-2 w-[40px] rounded-lg bg-muted-foreground" />
                <div className="h-2 w-[50px] rounded-lg bg-muted-foreground" />
              </div>
              <div className="flex items-center space-x-2 rounded-md bg-card p-2 shadow-sm">
                <div className="h-4 w-4 rounded-full bg-muted-foreground" />
                <div className="h-2 w-[30px] rounded-lg bg-muted-foreground" />
              </div>
              <div className="flex items-center space-x-2 rounded-md bg-card p-2 shadow-sm">
                <div className="h-4 w-4 rounded-full bg-muted-foreground" />
                <div className="h-2 w-[30px] rounded-lg bg-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      );

    case 'compact':
      return (
        <div className="items-center rounded-lg border-2 border-muted p-1 hover:border-muted-low ">
          <div className="space-y-2 rounded-md p-2 bg-[#ecedef] dark:bg-slate-950">
            <div className="flex items-center space-x-2 rounded-md  p-2 shadow-sm bg-white dark:bg-card">
              <div className="h-4 w-5 rounded-full bg-[#ecedef] dark:bg-muted-foreground" />
              <div className="space-y-2 rounded-md w-full">
                <div className="h-2 w-full rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
              </div>
            </div>
            <Separator />
            <div className="flex items-center space-x-2 rounded-md p-2 shadow-sm bg-white dark:bg-card">
              <div className="h-4 w-5 rounded-full bg-[#ecedef] dark:bg-muted-foreground" />
              <div className="space-y-2 rounded-md w-full">
                <div className="h-2 w-full rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
              </div>
            </div>
            <Separator />
            <div className="flex items-center space-x-2 rounded-md p-2 shadow-sm bg-white dark:bg-card">
              <div className="h-4 w-5 rounded-full bg-[#ecedef] dark:bg-muted-foreground" />
              <div className="space-y-2 rounded-md w-full">
                <div className="h-2 w-full rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      );

    case 'cozy':
      return (
        <div className="items-center rounded-lg border-2 border-muted p-1 hover:border-muted-low">
          <div className="space-y-2 rounded-md p-2 bg-[#ecedef] dark:bg-slate-950">
            <div className="flex items-start space-x-2 rounded-md  p-2 shadow-sm bg-white dark:bg-card">
              <div className="h-4 w-5 rounded-full bg-[#ecedef] dark:bg-muted-foreground" />
              <div className="space-y-2 rounded-md w-full">
                <div className="h-2 w-[40%] rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
                <div className="h-2 w-full rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
                <div className="h-2 w-[80%] rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
              </div>
            </div>
            <Separator />
            <div className="flex items-start space-x-2 rounded-md  p-2 shadow-sm bg-white dark:bg-card">
              <div className="h-4 w-5 rounded-full bg-[#ecedef] dark:bg-muted-foreground" />
              <div className="space-y-2 rounded-md w-full">
                <div className="h-2 w-[40%] rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
                <div className="h-2 w-full rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
                <div className="h-2 w-[80%] rounded-lg bg-[#ecedef] dark:bg-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
};

export default ThemeSkeleton;
