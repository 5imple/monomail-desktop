import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/renderer/app/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground'
      },
      sizeVariant: {
        default: 'font-medium h-8',
        sm: 'font-medium h-7 px-2',
        xs: 'font-medium h-5 px-1'
      }
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default'
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, sizeVariant, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(badgeVariants({ variant, sizeVariant }), className)} {...props}>
        {children}
      </div>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
