import { cn } from '@/renderer/app/lib/utils';
import React, { FC, HTMLAttributes } from 'react';

interface BaseHeaderProps {
  className?: string;
  children?: React.ReactNode;
}

const BaseHeader: FC<BaseHeaderProps> = ({ className, children }) => {
  return (
    <header className={cn('h-8 fixed top-0 left-0 right-0 drag -z-10', className)}>
      {children}
    </header>
  );
};

export default BaseHeader;
