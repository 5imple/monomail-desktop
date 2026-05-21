import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/renderer/app/lib/utils';

// Create a custom Provider that fixes the re-render issue
const OptimizedTooltipProvider = ({
  children,
  delayDuration = 700,
  skipDelayDuration = 300,
  disableHoverableContent = false,
  ...props
}: TooltipPrimitive.TooltipProviderProps) => {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    >
      {children}
    </TooltipPrimitive.Provider>
  );
};

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      // Newton tooltip: tighter padding, slightly heavier shadow on a
      // calm card background. Drops the prior `dark` class — that forced
      // dark-on-dark even in light mode, which read as a chunky black
      // pill against the otherwise light UI.
      'z-50 inline-flex items-center gap-1.5 overflow-hidden rounded-md border border-border/60 bg-popover px-2 py-1 text-[12px] font-medium text-popover-foreground shadow-md',
      // Open/close animations tied to Radix's data-state so the fade +
      // zoom-in fires reliably every time the tooltip opens, not just
      // on initial mount.
      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      className
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, OptimizedTooltipProvider as TooltipProvider };
