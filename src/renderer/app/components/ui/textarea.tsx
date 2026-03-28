import * as React from 'react';

import { cn } from '@/renderer/app/lib/utils';
import { ringVariants } from '@/renderer/app/components/ui/constants';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean; // Add autoResize as an optional prop
  maxHeight?: string; // Add maxHeight as an optional prop
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = false, maxHeight, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    React.useEffect(() => {
      if (autoResize && textareaRef.current) {
        const textarea = textareaRef.current;
        const resize = () => {
          textarea.style.height = 'auto'; // Reset height
          textarea.style.height = `${textarea.scrollHeight}px`; // Adjust height based on scrollHeight

          if (maxHeight && textarea.scrollHeight > parseInt(maxHeight, 10)) {
            textarea.style.height = maxHeight; // Cap height at maxHeight
            textarea.style.overflow = 'auto'; // Add scroll when maxHeight is exceeded
          } else {
            textarea.style.overflow = 'hidden'; // Remove scroll if within maxHeight
          }
        };

        resize(); // Initial resize on mount
        textarea.addEventListener('input', resize);
        return () => {
          textarea.removeEventListener('input', resize);
        };
      }
      return;
    }, [autoResize, maxHeight]);

    return (
      <textarea
        ref={(node) => {
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
          textareaRef.current = node;
        }}
        className={cn(
          'flex h-auto w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        style={{
          maxHeight
          // msScrollbarTrackColor: 'transparent'
          // scrollbarWidth: '1px', // For Firefox
          // msOverflowStyle: 'none' // For IE and Edge
        }}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea };
