import React, { useState, useLayoutEffect, useRef, useCallback } from 'react';
import { Input } from '@/renderer/app/components/ui/input';
import { cn } from '@/renderer/app/lib/utils';

const EnhancedInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof Input>
>((props, ref) => {
  const [enhancedValue, setEnhancedValue] = useState<React.ReactNode[]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

  const updateEnhancedValue = useCallback(() => {
    if (typeof props.value === 'string') {
      const parts = props.value.split(/(\s+)/);
      const enhanced = parts.map((part, index) => {
        if (part.trim() && part.includes(':')) {
          return (
            <span key={index} className="-mx-0.5 rounded-md bg-primary/20 px-0.5">
              {part}
            </span>
          );
        }
        return <span key={index}>{part.replace(/ /g, '\u00A0')}</span>;
      });
      setEnhancedValue(enhanced);
    }
  }, [props.value]);

  useLayoutEffect(() => {
    updateEnhancedValue();
  }, [updateEnhancedValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (props.onChange) {
      props.onChange(e);
    }
  };

  return (
    <div className="relative">
      <div
        ref={measureRef}
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center overflow-hidden p-2 text-lg'
        )}
      >
        {enhancedValue}
      </div>
      <Input
        {...props}
        ref={ref}
        onChange={handleChange}
        value={props.value}
        variant={'transparent'}
        className={cn(
          'border-none bg-transparent text-lg text-transparent caret-primary selection:bg-primary/20',
          props.className
        )}
      />
    </div>
  );
});

EnhancedInput.displayName = 'EnhancedInput';
export default EnhancedInput;
