import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { Tooltip, TooltipTrigger, TooltipContent } from '@/renderer/app/components/ui/tooltip';

import { cn } from '@/renderer/app/lib/utils';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { Keys } from 'react-hotkeys-hook';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-normal ring-offset-background transition-all disabled:pointer-events-none disabled:opacity-50 no-drag active:scale-[0.99]',
    ringVariants
  ),
  {
    variants: {
      variant: {
        // default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        default:
          'text-primary-foreground border border-primary/95 shadow-sm ' +
          'bg-gradient-to-t from-primary to-[#303030ff] dark:from-neutral-200 dark:to-primary bg-primary dark:bg-neutral-200 hover:bg-none hover:bg-primary  dark:hover:neutral-200',
        destructive:
          'bg-gradient-to-t from-red-700 to-destructive text-destructive-foreground hover:bg-none bg-red-700 hover:bg-red-700 border-destructive/95',
        outline: 'border border-input bg-background hover:bg-muted-low/50 hover:text-foreground',
        // secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        secondary:
          'bg-gradient-to-t from-secondary dark:from-background to-background dark:to-secondary text-secondary-foreground hover:bg-none bg-secondary dark:bg-background hover:bg-secondary dark:hover:bg-background border shadow-sm',
        ghost: 'hover:bg-muted hover:text-foreground',
        text: 'hover:text-foreground text-foreground',
        link: 'text-accent dark:text-accent underline-offset-2 underline'
      },
      sizeVariant: {
        default: 'h-10 rounded-md p-3',
        xxs: 'h-5 rounded-sm p-0.5 text-xs',
        xs: 'h-7 rounded-sm p-1 text-xs',
        sm: 'h-8 rounded-md p-2',
        lg: 'h-11 rounded-md px-8 py-2',
        xl: 'h-12 rounded-md px-10 py-4'
      },
      typeVariant: {
        default: 'py-0',
        icon: '',
        inline: 'p-0 h-fit'
      }
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default',
      typeVariant: 'default'
    },
    compoundVariants: [
      {
        typeVariant: 'icon',
        sizeVariant: 'default',
        className: 'h-10 w-10'
      },
      {
        typeVariant: 'icon',
        sizeVariant: 'xs',
        className: 'h-7 w-7'
      },
      {
        typeVariant: 'icon',
        sizeVariant: 'xxs',
        className: 'h-5 w-5'
      },
      {
        typeVariant: 'icon',
        sizeVariant: 'sm',
        className: 'h-8 w-8'
      },
      {
        typeVariant: 'icon',
        sizeVariant: 'lg',
        className: 'h-9 w-9 p-4'
      }
    ]
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  tooltip?: React.ReactNode;
  tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
  shortcut?: Keys;
  localTooltip?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      sizeVariant,
      asChild = false,
      tooltip,
      tooltipSide,
      typeVariant,
      shortcut,
      localTooltip = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    // Memoize the button element to avoid recreating it on every render
    const buttonElement = React.useMemo(
      () => (
        <Comp
          className={cn(buttonVariants({ variant, sizeVariant, typeVariant, className }))}
          ref={ref}
          {...props}
        />
      ),
      [Comp, className, variant, sizeVariant, typeVariant, ref, props]
    );

    // Memoize the tooltip content
    const tooltipContent = React.useMemo(
      () =>
        tooltip && (
          <TooltipContent side={tooltipSide} className="dark max-w-64">
            <div className="text-start">
              <div>{tooltip}</div>
              {shortcut && (
                <div className="mt-0.5">
                  <ShortcutKeyboard variant="flat" shortcut={shortcut} />
                </div>
              )}
            </div>
          </TooltipContent>
        ),
      [tooltip, tooltipSide, shortcut]
    );

    // Early return pattern for conditional rendering
    if (!tooltip) return buttonElement;

    // Return with tooltip when needed
    return (
      <Tooltip>
        <TooltipTrigger asChild>{buttonElement}</TooltipTrigger>
        {localTooltip ? tooltipContent : <TooltipPortal>{tooltipContent}</TooltipPortal>}
      </Tooltip>
    );
  }
);
Button.displayName = 'Button';
// Wrap the entire component with React.memo for top-level memoization
const MemoizedButton = React.memo(Button) as typeof Button;
MemoizedButton.displayName = 'MemoizedButton';

export { MemoizedButton as Button, buttonVariants };
