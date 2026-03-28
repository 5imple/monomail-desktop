import MonoIcon from '@/renderer/app/components/icons/icons';
import { cn } from '@/renderer/app/lib/utils';

import { FC } from 'react';

interface LoaderProps {
  variant?: 'default' | 'ios' | 'sticky';
  className?: string;
}

const Loader: FC<LoaderProps> = ({ className, variant }) => {
  switch (variant) {
    // case 'ios':
    // return <Loader className={cn(`animate-spin w-4 h-4 text-muted-foreground`, className)} />;

    case 'sticky':
    default:
      return (
        <MonoIcon
          type={'Loader2'}
          className={cn(`animate-spin w-4 h-4 text-muted-foreground`, className)}
        />
      );
  }
};

export default Loader;
