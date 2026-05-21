import { Button } from '@/renderer/app/components/ui/button';
import Loader from '@/renderer/app/components/ui/loader';
import electronApi from '@/renderer/app/lib/electronApi';
import {
  PWA_UPDATE_EVENT,
  handlePWAUpdate,
  handlePWAUpdateWithManualActivation
} from '@/renderer/app/lib/pwa';
import { animated, useSpring } from '@react-spring/web';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UpdateNotificationCardProps {}

type UpdateType = 'electron' | 'pwa' | null;

const UpdateNotificationCard: FC<UpdateNotificationCardProps> = ({}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateType, setUpdateType] = useState<UpdateType>(null);
  const [pwaUpdateFunction, setPwaUpdateFunction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // Handle Electron updates (only in Electron environment)
    if (window.electronBridge) {
      electronApi.checkForUpdate();
      electronApi.on('renderer:update:available', () => {
        setUpdateType('electron');
        setIsVisible(true);
      });
    }

    // Handle PWA updates (web environment)
    const handlePWAUpdate = (event: CustomEvent) => {
      setUpdateType('pwa');
      setPwaUpdateFunction(() => event.detail.updateFunction);
      setIsVisible(true);
    };

    window.addEventListener(PWA_UPDATE_EVENT, handlePWAUpdate as EventListener);

    return () => {
      window.removeEventListener(PWA_UPDATE_EVENT, handlePWAUpdate as EventListener);
    };
  }, []);

  const handleUpdate = async () => {
    if (updateType === 'electron') {
      electronApi.downloadAndInstallUpdate();
    } else if (updateType === 'pwa' && pwaUpdateFunction) {
      // Use the proper PWA update handler with comprehensive error handling
      setIsUpdating(true);
      await handlePWAUpdate(pwaUpdateFunction);

      setTimeout(() => {
        setIsUpdating(false);
      }, 2000);
    }
  };

  const getUpdateContent = () => {
    if (updateType === 'electron') {
      return {
        title: t('update_notification.electron.title'),
        description: t('update_notification.electron.description'),
        buttonText: t('update_notification.electron.button')
      };
    } else {
      return {
        title: t('update_notification.pwa.title'),
        description: t('update_notification.pwa.description'),
        buttonText: t('update_notification.pwa.button')
      };
    }
  };

  const styles = useSpring({
    opacity: isVisible ? 1 : 0,
    height: isVisible ? '' : '0px',
    transform: isVisible ? 'scale(1) translateY(0%)' : 'scale(0.95) translateY(0%)',
    config: { tension: 220, friction: 20 }
  });

  const content = getUpdateContent();

  return (
    <animated.div style={{ ...styles }}>
      {isVisible && (
        <div className="m-2 mb-16 mt-0">
          <div className={'group w-full rounded-lg border border-border/60 bg-card p-3 shadow-md'}>
            <div className="mb-3">
              <h4 className="mb-1 text-sm font-medium">{content.title}</h4>
              <p className="text-sm text-muted-foreground">{content.description}</p>
            </div>
            <div>
              <Button
                disabled={isUpdating}
                sizeVariant="xs"
                className="w-full"
                onClick={handleUpdate}
              >
                {isUpdating && <Loader className="mr-2" />}
                {content.buttonText}
              </Button>
            </div>
          </div>
        </div>
      )}
    </animated.div>
  );
};

export default UpdateNotificationCard;
