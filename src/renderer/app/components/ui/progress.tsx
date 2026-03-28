import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

import { cn } from '@/renderer/app/lib/utils';

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { isLoading?: boolean }
>(({ className, value, isLoading, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted-low', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn('h-full flex-1 bg-foreground transition-all duration-1000', {
        loading: isLoading
      })}
      style={{ transform: isLoading ? undefined : `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
