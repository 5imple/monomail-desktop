import VerificationCodeNotification from '@/renderer/app/containers/notification/VerificationCodeNotification';
import VerificationUrlNotification from '@/renderer/app/containers/notification/VerificationUrlNotification';
import { getSupportEmail } from '@/renderer/app/lib/runtimeBranding';
import { AudioType, playSound } from '@/renderer/app/lib/soundManager';
import { FC } from 'react';
import { useSearchParams } from 'react-router-dom';
interface NotificationContainerProps {}

const NotificationContainer: FC<NotificationContainerProps> = () => {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') as 'VERIFICATION_CODE' | 'VERIFICATION_URL';
  const id = searchParams.get('id') as string;
  const data = searchParams.get('data') as string;
  const from = searchParams.get('from') as string;
  const audio = (searchParams.get('audio') as AudioType) ?? 'Mono';

  const renderNotification = () => {
    if (data)
      switch (type) {
        case 'VERIFICATION_CODE':
          playSound(audio);
          return (
            <VerificationCodeNotification id={id} code={data} from={from ?? getSupportEmail()} />
          );
        case 'VERIFICATION_URL':
          playSound(audio);
          return (
            <VerificationUrlNotification id={id} url={data} from={from ?? getSupportEmail()} />
          );
      }

    return null;
  };
  return (
    <div className="absolute grid items-center justify-end left-[16px] right-[16px] top-[16px] bottom-[16px]">
      {renderNotification()}
    </div>
  );
};

export default NotificationContainer;
