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

interface VerificationCodeNotificationProps {
  id: string;
  code: string;
  from: string;
}

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const VerificationCodeNotification: FC<VerificationCodeNotificationProps> = ({
  id,
  code,
  from
}) => {
  const verificationCode = code;
  const [isVisible, setIsVisible] = useState(false); // Initial state for visibility
  const { isWindowFocused } = useWindowFocus();

  useEffect(() => {
    // Delay the visibility change by 50ms
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 50);

    return () => clearTimeout(timer); // Clean up the timer on unmount
  }, [from]);

  const [copied, setCopied] = useState(false);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(verificationCode).then(
      () => {
        setCopied(true);

        setTimeout(() => {
          setCopied(false);
          electronApi.notificationClose(id); // Close after 2 seconds
        }, 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
      }
    );
  };

  const handleClose = () => {
    // Set isVisible to false immediately
    setIsVisible(false);

    // Call the close API after 300ms
    setTimeout(() => {
      electronApi.notificationClose(id);
    }, 300);
  };

  const domain = capitalizeFirstLetter(extractDomainFromEmail(from));

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
        <NotificationSubtitle subtitle="Verification code" />
      </div>
      <NotificationButton onClick={handleCopyToClipboard}>
        <div className="max-w-20 overflow-hidden text-ellipsis">
          <span className="whitespace-nowrap">{verificationCode}</span>
        </div>
        {copied ? (
          <MonoIcon type={'CheckCircle'} className="ml-2 h-4 w-4 text-green-500" />
        ) : (
          <MonoIcon type={'Copy'} className="ml-2 h-4 w-4 text-muted-foreground" />
        )}
      </NotificationButton>
    </Notification>
  );
};

export default VerificationCodeNotification;
