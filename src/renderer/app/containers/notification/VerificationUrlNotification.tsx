import MonoIcon from '@/renderer/app/components/icons/icons';
import {
  Notification,
  NotificationButton,
  NotificationCloseButton,
  NotificationSubtitle,
  NotificationTitle
} from '@/renderer/app/components/ui/notification';
import useWindowFocus from '@/renderer/app/hooks/useWindowFocus';
import electronApi from '@/renderer/app/lib/electronApi';
import { extractDomainFromEmail, getFaviconFromEmail } from '@/renderer/app/lib/faviconUtils';
import { FC, useEffect, useState } from 'react';

interface VerificationUrlNotificationProps {
  id: string;
  url: string;
  from: string;
}

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const VerificationUrlNotification: FC<VerificationUrlNotificationProps> = ({ id, url, from }) => {
  const [isVisible, setIsVisible] = useState(false); // Initial state for visibility
  const { isWindowFocused } = useWindowFocus();

  useEffect(() => {
    // Delay the visibility change by 50ms
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100);
    return () => clearTimeout(timer); // Clean up the timer on unmount
  }, [from]);

  const handleOpenUrl = () => {
    window.open(`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/verification/${url}`, '_blank');
    electronApi.notificationClose(id);
  };

  const domain = capitalizeFirstLetter(extractDomainFromEmail(from));

  const handleClose = () => {
    // Set isVisible to false immediately
    setIsVisible(false);

    // Call the close API after 300ms
    setTimeout(() => {
      electronApi.notificationClose(id);
    }, 300);
  };

  return (
    <Notification isVisible={isVisible}>
      <NotificationCloseButton onClick={handleClose} />
      <div
        // onClick={() => electronApi.notificationClicked(id)}
        className="flex min-w-56 max-w-60 flex-1 flex-col"
      >
        <NotificationTitle
          title={domain}
          icon={<img src={getFaviconFromEmail(from)} className="mr-2 h-4 w-4" alt="" />}
        />
        <NotificationSubtitle subtitle="Verify your account" />
      </div>
      <NotificationButton onClick={handleOpenUrl}>
        Open Link
        <MonoIcon type={'ExternalLink'} className="ml-2 h-4 w-4 text-muted-foreground" />
      </NotificationButton>
    </Notification>
  );
};

export default VerificationUrlNotification;
