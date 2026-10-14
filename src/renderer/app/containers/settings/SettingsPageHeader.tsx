import { cn } from '@/renderer/app/lib/utils';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface SettingsPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  scope?: string;
  action?: ReactNode;
  className?: string;
}

// One style for every section title inside a settings page (Theme, Alert
// Sound, Inbox Categories…); they used three type scales.
export const SETTINGS_SECTION_TITLE = 'text-sm font-medium text-foreground';

// Marks a setting whose value differs from the saved one. The old dots used
// bg-accent, a near-white neutral that didn't show on either theme.
export function SettingsChangeDot() {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={t('settings.unsaved_change', 'Unsaved change')}
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-secondary-accent"
    />
  );
}

// Newton-style settings hero. Mono uppercase tracked scope label sits
// above a tracking-tight title, mirroring the inbox/reader hero
// pattern so settings reads as a first-class section rather than a
// scrolling form dump.
export function SettingsPageHeader({
  title,
  description,
  scope,
  action,
  className
}: SettingsPageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex items-start gap-4', className)}>
      <div className="min-w-0 flex-1">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {scope ?? t('settings.title')}
        </p>
        <h2 className="text-[22px] font-medium tracking-tight text-foreground sm:text-[26px]">
          {title}
        </h2>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* Clear of the dialog's close button, which sits over the top-right corner. */}
      {action && <div className="ml-auto mr-10 shrink-0">{action}</div>}
    </div>
  );
}
