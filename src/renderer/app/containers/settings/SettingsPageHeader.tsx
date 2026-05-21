import { cn } from '@/renderer/app/lib/utils';
import type { ReactNode } from 'react';

interface SettingsPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  scope?: string;
  action?: ReactNode;
  className?: string;
}

// Newton-style settings hero. Mono uppercase tracked scope label sits
// above a tracking-tight title, mirroring the inbox/reader hero
// pattern so settings reads as a first-class section rather than a
// scrolling form dump.
export function SettingsPageHeader({
  title,
  description,
  scope = 'Settings',
  action,
  className
}: SettingsPageHeaderProps) {
  return (
    <div className={cn('flex items-start gap-4', className)}>
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {scope}
        </p>
        <h2 className="text-[22px] font-medium tracking-tight text-foreground sm:text-[26px]">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
