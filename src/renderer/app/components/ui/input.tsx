import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/renderer/app/lib/utils';
import { ringVariants } from '@/renderer/app/components/ui/constants';

// Wrapper variants for when elements are inside the input
const inputWrapperVariants = cva(
  cn(
    'flex w-full rounded-lg border-input bg-background text-sm ring-offset-background transition-color focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2'
  ),
  {
    variants: {
      variant: {
        default: 'border border-input bg-background shadow-sm',
        underline: 'border-b border-input bg-background rounded-none',
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
    'h-10 w-full rounded-lg border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-color focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-ring focus-visible:ring-offset-0'
  ),
  {
    variants: {
      variant: {
        default: 'border border-input bg-background shadow-sm',
        underline: 'border-b border-input bg-background rounded-none',
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
      return (
        <div
          className={cn(
            inputWrapperVariants({ variant, sizeVariant }),
            'items-center',
            wrapperClassName
          )}
        >
          {prepend && (
            <div
              className={cn(
                'mx-1 flex items-center justify-center',
                sizeVariant === 'default' && 'pl-3',
                sizeVariant === 'sm' && 'pl-2',
                sizeVariant === 'lg' && 'pl-4'
              )}
            >
              <span className="text-muted-foreground">{prepend}</span>
            </div>
          )}
          <input
            type={type}
            className={cn(
              internalInputVariants({ sizeVariant }),
              !prepend && sizeVariant === 'default' && 'pl-3',
              !prepend && sizeVariant === 'sm' && 'pl-2',
              !prepend && sizeVariant === 'lg' && 'pl-4',
              !append && sizeVariant === 'default' && 'pr-3',
              !append && sizeVariant === 'sm' && 'pr-2',
              !append && sizeVariant === 'lg' && 'pr-4',
              className
            )}
            ref={ref}
            {...props}
          />
          {append && (
            <div
              className={cn(
                'mx-1 flex items-center justify-center',
                sizeVariant === 'default' && 'pr-3',
                sizeVariant === 'sm' && 'pr-2',
                sizeVariant === 'lg' && 'pr-4'
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
