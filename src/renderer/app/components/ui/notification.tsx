import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { cn } from '@/renderer/app/lib/utils';
import React, { FC } from 'react';

interface NotificationProps {
  isVisible: boolean;
  className?: string;
  children: React.ReactNode;
}

const Notification: FC<NotificationProps> = ({ isVisible, children, className }) => {
  return (
    <div
      className={cn(
        'group relative flex h-full w-full items-center gap-2 rounded-xl bg-card p-4 transition-opacity duration-200',
        isVisible ? 'scale-100 opacity-100' : 'scale-[0.99] opacity-0',
        className
      )}
    >
      {children}
    </div>
  );
};

interface NotificationTitleProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
}

const NotificationTitle: FC<NotificationTitleProps> = ({ title, icon }) => {
  return (
    <div className="flex items-center justify-start">
      {icon}
      <div className="font-regular line-clamp-1 text-sm text-foreground">{title}</div>
    </div>
  );
};

interface NotificationSubtitleProps {
  subtitle: string;
}

const NotificationSubtitle: FC<NotificationSubtitleProps> = ({ subtitle }) => {
  return <div className="line-clamp-1 text-sm text-muted-foreground">{subtitle}</div>;
};

interface NotificationCloseButtonProps {
  onClick?: () => void;
}

const NotificationCloseButton: FC<NotificationCloseButtonProps> = ({ onClick }) => {
  return (
    <div
      onClick={onClick}
      className="absolute -left-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-lg hover:bg-background group-hover:flex"
    >
      <MonoIcon type={'X'} className="h-4 w-4" />
    </div>
  );
};

interface NotificationButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
}

const NotificationButton: FC<NotificationButtonProps> = ({ onClick, children }) => {
  return (
    <Button variant={'secondary'} onClick={onClick}>
      {children}
    </Button>
  );
};
export {
  Notification,
  NotificationButton,
  NotificationCloseButton,
  NotificationSubtitle,
  NotificationTitle
};
