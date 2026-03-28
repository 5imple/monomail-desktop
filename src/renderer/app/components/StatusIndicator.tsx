import { useStatusCheck, ServiceStatus } from '@/renderer/app/services/StatusCheckService';
import { useTranslation } from 'react-i18next';
import { cn } from '@/renderer/app/lib/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';

const StatusIndicator = () => {
  const statusState = useStatusCheck();
  const { t } = useTranslation();

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case 'operational':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'outage':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getOverallStatus = (): ServiceStatus => {
    const statuses = Object.values(statusState).map((state) => state.status);
    if (statuses.includes('outage')) return 'outage';
    if (statuses.includes('degraded')) return 'degraded';
    return 'operational';
  };

  const getStatusMessage = () => {
    const messages = Object.values(statusState)
      .filter((state) => state.message)
      .map((state) => state.message);

    if (messages.length > 0) {
      return messages[0];
    }

    const overallStatus = getOverallStatus();
    return t(`layout.status.${overallStatus}`);
  };

  const overallStatus = getOverallStatus();
  const statusMessage = getStatusMessage();

  if (overallStatus === 'operational') {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-2 text-sm',
        overallStatus === 'outage'
          ? 'bg-red-500 text-white'
          : overallStatus === 'degraded'
            ? 'bg-yellow-500 text-black'
            : 'bg-gray-500 text-white'
      )}
    >
      <MonoIcon type="AlertCircle" />
      <span>{statusMessage}</span>
    </div>
  );
};

export default StatusIndicator;
