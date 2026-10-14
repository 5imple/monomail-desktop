import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/renderer/app/lib/utils';

// Wrapper variants for when elements are inside the input
const inputWrapperVariants = cva(
  cn(
    'flex w-full rounded-md border-input bg-background text-sm ring-offset-background transition-colors focus-within:outline-none'
  ),
  {
    variants: {
      variant: {
        default: 'border border-input bg-background shadow-sm focus-within:border-ring',
        underline: 'border-b border-input bg-background rounded-none focus-within:border-ring',
        ghost: 'border-none bg-muted',
        transparent: 'border-none bg-transparent'
      },
      sizeVariant: {
        default: 'h-10',
        sm: 'h-8',
        lg: 'h-12'
      }
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default'
    }
  }
);

// Internal input variants (for when elements are inside)
const internalInputVariants = cva(
  cn(
    'flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50'
  ),
  {
    variants: {
      sizeVariant: {
        default: 'h-10 py-2',
        sm: 'h-8 py-1 text-xs',
        lg: 'h-12 py-3'
      }
    },
    defaultVariants: {
      sizeVariant: 'default'
    }
  }
);

// Original input variants (for when elements are outside)
const externalInputVariants = cva(
  cn(
    'h-10 w-full rounded-md border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-ring focus-visible:ring-offset-0'
  ),
  {
    variants: {
      variant: {
        // A bordered field shows focus by darkening its border; the
        // borderless ones (compose) stay as they are.
        default: 'border border-input bg-background shadow-sm focus-visible:border-ring',
        underline: 'border-b border-input bg-background rounded-none focus-visible:border-ring',
        ghost: 'border-none bg-muted',
        transparent: 'border-none bg-transparent'
      },
      sizeVariant: {
        default: 'h-10 px-3 py-2',
        sm: 'h-8 px-2 py-1',
        lg: 'h-12 px-4 py-3'
      }
    },
    defaultVariants: {
      variant: 'default',
      sizeVariant: 'default'
    }
  }
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputWrapperVariants> {
  append?: React.ReactNode;
  prepend?: React.ReactNode;
  // Option to place elements inside or outside the input
  elementsPosition?: 'inside' | 'outside';
  sizeVariant?: 'default' | 'sm' | 'lg';
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      sizeVariant,
      type,
      append,
      prepend,
      elementsPosition = 'outside',
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    // Elements inside the input field
    if (elementsPosition === 'inside') {
      // The side padding below keys on the size, which cva's default doesn't
      // fill in: without a sizeVariant the field had none.
      const size = sizeVariant ?? 'default';
      return (
        <div
          className={cn(
            inputWrapperVariants({ variant, sizeVariant: size }),
            'items-center',
            wrapperClassName
          )}
        >
          {prepend && (
            <div
              className={cn(
                'mx-1 flex items-center justify-center',
                size === 'default' && 'pl-3',
                size === 'sm' && 'pl-2',
                size === 'lg' && 'pl-4'
              )}
            >
              <span className="text-muted-foreground">{prepend}</span>
            </div>
          )}
          <input
            type={type}
            className={cn(
              internalInputVariants({ sizeVariant: size }),
              !prepend && size === 'default' && 'pl-3',
              !prepend && size === 'sm' && 'pl-2',
              !prepend && size === 'lg' && 'pl-4',
              !append && size === 'default' && 'pr-3',
              !append && size === 'sm' && 'pr-2',
              !append && size === 'lg' && 'pr-4',
              className
            )}
            ref={ref}
            {...props}
          />
          {append && (
            <div
              className={cn(
                'mx-1 flex items-center justify-center',
                size === 'default' && 'pr-3',
                size === 'sm' && 'pr-2',
                size === 'lg' && 'pr-4'
              )}
            >
              <span className="text-muted-foreground">{append}</span>
            </div>
          )}
        </div>
      );
    }

    // Elements outside the input field (original behavior)
    return (
      <div
        className={cn(
          'flex flex-grow items-center',
          sizeVariant === 'default' && 'h-10',
          sizeVariant === 'sm' && 'h-8',
          sizeVariant === 'lg' && 'h-12',
          wrapperClassName
        )}
      >
        {prepend && <span className="mr-2 text-sm text-muted-foreground">{prepend}</span>}
        <input
          type={type}
          className={cn('flex-1', externalInputVariants({ variant, sizeVariant, className }))}
          ref={ref}
          {...props}
        />
        {append && <span className="ml-2 text-sm text-muted-foreground">{append}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input, inputWrapperVariants, internalInputVariants, externalInputVariants };
