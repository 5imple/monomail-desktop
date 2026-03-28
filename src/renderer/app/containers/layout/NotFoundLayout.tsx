import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import BaseHeader from '@/renderer/app/containers/header/BaseHeader';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface NotFoundLayoutProps {}

const NotFoundLayout: FC<NotFoundLayoutProps> = ({}) => {
  const { t } = useTranslation();
  const handleRelaunch = () => {
    window.location.replace('/');
  };

  return (
    <div className="flex h-screen items-center justify-center">
      <BaseHeader />
      <div className="text-center">
        <MonoIcon className="mx-auto mb-2 h-4 w-4 text-destructive" type={'AlertCircle'} />
        <p className="text-md mb-4 text-muted-foreground">
          {t('layout.not_found.title', 'Oops, something went wrong...')}
        </p>
        <Button variant={'secondary'} onClick={handleRelaunch} className="mb-3">
          {t('layout.not_found.relaunch', 'Relaunch')}
        </Button>
      </div>
    </div>
  );
};

export default NotFoundLayout;
