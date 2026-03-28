import React, { useState, useLayoutEffect, useRef, useCallback, useEffect } from 'react';
import { CommandInput } from '@/renderer/app/components/ui/command';
import { cn } from '@/renderer/app/lib/utils';

interface EnhancedCommandInputProps extends React.ComponentPropsWithoutRef<typeof CommandInput> {
  renderCondition?: (part: string) => boolean; // New prop to define custom conditions
}

const EnhancedCommandInput: React.FC<EnhancedCommandInputProps> = (props) => {
  const { renderCondition, ...restProps } = props;
  const [enhancedValue, setEnhancedValue] = useState<React.ReactNode[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0); // State to keep track of the scroll position

  const updateEnhancedValue = useCallback(() => {
    if (typeof props.value === 'string') {
      const parts = props.value.split(/(\s+)/);
      const enhanced = parts.map((part, index) => {
        if (part.trim() && (renderCondition ? renderCondition(part) : false)) {
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
  }, [props.value, renderCondition]);

  // Sync scroll position with input’s content width and caret position
  const syncScrollPosition = useCallback(() => {
    if (inputRef.current) {
      setScrollLeft(inputRef.current.scrollLeft);
    }
  }, []);

  useLayoutEffect(() => {
    updateEnhancedValue();
    syncScrollPosition();
  }, [updateEnhancedValue, syncScrollPosition, props.value]);

  useEffect(() => {
    // Update scroll position on arrow key moves or mouse drag
    const handleInputScroll = () => syncScrollPosition();

    if (inputRef.current) {
      inputRef.current.addEventListener('scroll', handleInputScroll);
    }

    return () => {
      if (inputRef.current) {
        inputRef.current.removeEventListener('scroll', handleInputScroll);
      }
    };
  }, [syncScrollPosition]);

  const handleChange = (value: string) => {
    if (props.onValueChange) {
      props.onValueChange(value);
    }
    syncScrollPosition();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (props.onKeyDown) {
      props.onKeyDown(e);
    }
    syncScrollPosition();
  };

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -left-2 -right-2 ml-3 mr-16 flex h-full overflow-hidden"
        style={{
          maskImage:
            'linear-gradient(90deg, transparent 0%, hsl(var(--card)) 2%, hsl(var(--card)) 98%, transparent 100%)'
        }}
      >
        <div
          ref={measureRef}
          className="pointer-events-none absolute inset-0 left-4 flex items-center whitespace-nowrap text-lg"
          style={{ transform: `translateX(-${scrollLeft}px)` }} // Sync scrolling with input
        >
          {enhancedValue}
        </div>
      </div>

      <CommandInput
        {...restProps}
        ref={inputRef}
        onValueChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={syncScrollPosition} // Track the scroll position of the input
        value={props.value}
        className={cn(
          props.className,
          'rounded-lg bg-transparent p-2 text-lg text-transparent caret-primary selection:bg-primary/15'
        )}
      />
    </div>
  );
};

export default EnhancedCommandInput;
