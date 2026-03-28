// Timeline.tsx
import React from 'react';
import { cn } from '@/renderer/app/lib/utils';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { useExecuteCommand } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useTranslation } from 'react-i18next';

// Timeline Item interface
interface TimelineItemProps {
  icon?: React.ReactNode;
  iconType?: string;
  title: string;
  isLast?: boolean;
  isLink?: boolean;
  onClick?: () => void;
  external?: boolean;
  url?: string;
  badge?: string;
  className?: string;
}

// Timeline Item Component
export const TimelineItem: React.FC<TimelineItemProps> = ({
  icon,
  iconType,
  title,
  isLast = false,
  isLink = false,
  onClick,
  external = false,
  url,
  badge,
  className
}) => {
  const renderIcon = () => {
    if (icon)
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-muted-low text-xs">
          {icon}
        </div>
      );
    return <div className="ml-px aspect-square h-1.5 w-1.5 rounded-sm bg-foreground/60"></div>;
  };

  const itemContent = (
    <>
      <div
        className={cn(
          '-m-1 flex items-center rounded-md p-1 transition-all hover:bg-muted',
          className
        )}
      >
        <div className="relative">
          <div className={cn('mr-2 flex h-6 w-6 items-center justify-center')}>{renderIcon()}</div>
        </div>
        <span className={cn('mr-1 line-clamp-1 text-sm')}>{title}</span>
        {badge && (
          <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {badge}
          </span>
        )}
      </div>
      {!isLast && <div className="absolute left-3 h-full w-px bg-muted" />}
    </>
  );

  if (isLink) {
    return (
      <li className="relative">
        {external && url ? (
          <a className="block cursor-pointer" href={url} target="_blank" rel="noreferrer">
            {itemContent}
          </a>
        ) : (
          <div className="block w-full text-left" onClick={onClick}>
            {itemContent}
          </div>
        )}
      </li>
    );
  }

  return (
    <li onClick={onClick} className="relative">
      {itemContent}
    </li>
  );
};

// Timeline Component
interface TimelineProps {
  title?: string;
  items: Array<Omit<TimelineItemProps, 'isLast'>>;
  className?: string;
  compact?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({ title, items, className, compact = false }) => {
  return (
    <div className={cn('rounded-md bg-card p-2', className)}>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <TimelineItem key={index} {...item} isLast={index === items.length - 1} />
        ))}
      </ul>
    </div>
  );
};
