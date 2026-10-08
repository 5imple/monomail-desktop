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

// No progress or error comes back over IPC, so the busy state is
// time-boxed: the button can never stay stuck disabled.
const ELECTRON_UPDATE_BUSY_MS = 15000;

const UpdateNotificationCard: FC<UpdateNotificationCardProps> = ({}) => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateType, setUpdateType] = useState<UpdateType>(null);
  const [pwaUpdateFunction, setPwaUpdateFunction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // Handle Electron updates (only in Electron environment)
    let unsubscribe: (() => void) | undefined;
    if (window.electronBridge) {
      electronApi.checkForUpdate();
      unsubscribe = electronApi.on('renderer:update:available', () => {
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
      unsubscribe?.();
      window.removeEventListener(PWA_UPDATE_EVENT, handlePWAUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isUpdating || updateType !== 'electron') return;
    const timer = setTimeout(() => setIsUpdating(false), ELECTRON_UPDATE_BUSY_MS);
    return () => clearTimeout(timer);
  }, [isUpdating, updateType]);

  const handleUpdate = async () => {
    if (updateType === 'electron') {
      // Feedback while the updater takes over (it opens its own window).
      setIsUpdating(true);
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
            <div className="flex flex-col gap-1">
              <Button
                disabled={isUpdating}
                sizeVariant="xs"
                className="w-full"
                onClick={handleUpdate}
              >
                {isUpdating && <Loader className="mr-2" />}
                {isUpdating ? t('update_notification.updating') : content.buttonText}
              </Button>
              {/* Dismiss for this session; it comes back on the next launch. */}
              <Button
                variant="ghost"
                sizeVariant="xs"
                className="w-full text-muted-foreground"
                disabled={isUpdating}
                onClick={() => setIsVisible(false)}
              >
                {t('update_notification.later')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </animated.div>
  );
};

export default UpdateNotificationCard;
