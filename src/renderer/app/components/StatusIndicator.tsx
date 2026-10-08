import { isBackendConfigured } from '@/main/api/apiClient';
import { useStatusCheck, ServiceStatus } from '@/renderer/app/services/StatusCheckService';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useState } from 'react';

// The status feed tracks the infrastructure the hosted Mono backend runs on
// (Google Cloud). It says nothing about mail itself (Gmail / Microsoft 365 are
// reached directly), so only check it when such a backend is in use — not in
// standalone builds or against a local dev/mock server.
const backendStatusRelevant = () => {
  if (!isBackendConfigured()) return false;
  const apiUrl = (import.meta.env.MONO_ENV_API_URL || '').trim();
  try {
    const host = new URL(apiUrl).hostname;
    return !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  } catch {
    return true;
  }
};

const BackendStatusBanner = () => {
  const statusState = useStatusCheck();
  const { t } = useTranslation();
  // Dismissal holds until the message changes, so a new incident still shows.
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);

  const getOverallStatus = (): ServiceStatus => {
    const statuses = Object.values(statusState).map((state) => state.status);
    if (statuses.includes('outage')) return 'outage';
    if (statuses.includes('degraded')) return 'degraded';
    return 'operational';
  };

  const overallStatus = getOverallStatus();
  const statusMessage =
    Object.values(statusState).find((state) => state.message)?.message ||
    t(`status.${overallStatus}`);

  if (overallStatus === 'operational' || dismissedMessage === statusMessage) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm',
        overallStatus === 'outage'
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-muted text-foreground'
      )}
    >
      <MonoIcon type="AlertCircle" className="shrink-0" />
      <span className="line-clamp-1 min-w-0 flex-1" title={statusMessage}>
        {statusMessage}
      </span>
      <button
        aria-label={t('common.dismiss', { defaultValue: 'Dismiss' })}
        className="no-drag shrink-0 rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100"
        onClick={() => setDismissedMessage(statusMessage)}
      >
        <MonoIcon type="X" className="h-4 w-4" />
      </button>
    </div>
  );
};

const StatusIndicator = () => {
  if (!backendStatusRelevant()) return null;
  return <BackendStatusBanner />;
};

export default StatusIndicator;
