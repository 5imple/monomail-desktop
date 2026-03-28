import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/renderer/app/lib/utils';
import { ringVariants } from '@/renderer/app/components/ui/constants';

const toggleVariants = cva(
  `inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-muted-low data-[state=on]:text-muted-foreground ${ringVariants}`,
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent hover:bg-muted-low hover:text-foreground',
        text: 'hover:text-foreground text-foreground hover:bg-transparent data-[state=on]:bg-transparent',
        accent:
          'text-muted-foreground data-[state=on]:bg-transparent data-[state=on]:hover:bg-muted  data-[state=on]:text-accent'
      },
      sizeVariant: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-5'
      }
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default'
    }
  }
);

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>
>(({ className, variant, sizeVariant, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, sizeVariant, className }))}
    {...props}
  />
));

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle, toggleVariants };
