import { cn } from '@/renderer/app/lib/utils';
import * as React from 'react';

interface ListProps extends React.HTMLAttributes<HTMLDivElement> {}

const List = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-4 p-4 duration-200 hover:bg-muted rounded-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
List.displayName = 'List';

const ListHeader = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn(className)} {...props}>
      {children}
    </div>
  )
);
ListHeader.displayName = 'ListHeader';

const ListContent = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('', className)} {...props}>
      {children}
    </div>
  )
);
ListContent.displayName = 'ListContent';

const ListTitle = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold', className)} {...props}>
      {children}
    </div>
  )
);
ListTitle.displayName = 'ListTitle';

const ListDescription = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('text-muted-foreground', className)} {...props}>
      {children}
    </div>
  )
);
ListDescription.displayName = 'ListDescription';

const ListFooter = React.forwardRef<HTMLDivElement, ListProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('ml-auto text-right', className)} {...props}>
      {children}
    </div>
  )
);
ListFooter.displayName = 'ListFooter';

export { List, ListContent, ListDescription, ListFooter, ListHeader, ListTitle };
