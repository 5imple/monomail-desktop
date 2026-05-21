import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/renderer/app/lib/utils';

const notificationBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-destructive text-destructive-foreground',
        primary: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        success: 'bg-green-500 text-white',
        warning: 'bg-yellow-500 text-black',
        // Info badge uses Newton's neutral stone tone — the prior
        // `bg-blue-500` was a holdover from the old monomail blue identity.
        info: 'bg-muted-foreground text-background'
      },
      size: {
        sm: 'h-4 w-4 text-[10px] min-w-4',
        default: 'h-5 w-5 text-xs min-w-5',
        lg: 'h-6 w-6 text-sm min-w-6'
      },
      dot: {
        true: 'h-2 w-2 min-w-2',
        false: ''
      }
    },
    compoundVariants: [
      {
        dot: true,
        size: 'sm',
        className: 'h-2 w-2 min-w-2'
      },
      {
        dot: true,
        size: 'default',
        className: 'h-2.5 w-2.5 min-w-2.5'
      },
      {
        dot: true,
        size: 'lg',
        className: 'h-3 w-3 min-w-3'
      }
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      dot: false
    }
  }
);

export interface NotificationBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof notificationBadgeVariants> {
  count?: number;
  maxCount?: number;
  showZero?: boolean;
  dot?: boolean;
}

const NotificationBadge = React.forwardRef<HTMLDivElement, NotificationBadgeProps>(
  (
    {
      className,
      variant,
      size,
      count,
      maxCount = 99,
      showZero = false,
      dot = false,
      children,
      ...props
    },
    ref
  ) => {
    // Don't render if count is 0 and showZero is false, unless it's a dot variant
    if (!dot && count === 0 && !showZero) {
      return null;
    }

    // Don't render if count is undefined and it's not a dot variant
    if (!dot && count === undefined) {
      return null;
    }

    const displayCount = () => {
      if (dot || count === undefined) return null;
      if (count > maxCount) return `${maxCount}+`;
      return count.toString();
    };

    return (
      <div
        ref={ref}
        className={cn(notificationBadgeVariants({ variant, size, dot }), className)}
        {...props}
      >
        {displayCount()}
        {children}
      </div>
    );
  }
);

NotificationBadge.displayName = 'NotificationBadge';

export { NotificationBadge, notificationBadgeVariants };
