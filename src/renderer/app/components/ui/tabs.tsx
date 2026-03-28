import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/renderer/app/lib/utils';
import { ringVariants } from '@/renderer/app/components/ui/constants';
import { buttonVariants } from '@/renderer/app/components/ui/button';

const Tabs = TabsPrimitive.Root;

// TabsList component in animated-tabs.tsx
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const [indicatorStyle, setIndicatorStyle] = React.useState<{
    left: number;
    top: number;
    width: number | string;
    height: number | string;
    opacity: number;
  }>({
    left: 0,
    top: 0,
    opacity: 0,
    width: '0%',
    height: '100%'
  });
  const tabsListRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const updateIndicator = () => {
      if (tabsListRef.current) {
        const activeTab = tabsListRef.current.querySelector<HTMLElement>('[data-state="active"]');

        if (activeTab) {
          const activeRect = activeTab.getBoundingClientRect();
          const tabsRect = tabsListRef.current.getBoundingClientRect();
          setIndicatorStyle({
            left: activeRect.left - tabsRect.left,
            top: activeRect.top - tabsRect.top,
            width: activeRect.width,
            height: activeRect.height,
            opacity: 1
          });
        }
      }
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    const observer = new MutationObserver(updateIndicator);
    if (tabsListRef.current) {
      observer.observe(tabsListRef.current, {
        attributes: true,
        childList: true,
        subtree: true
      });
    }
    return () => {
      window.removeEventListener('resize', updateIndicator);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full" ref={tabsListRef}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center rounded-md bg-muted p-1 text-muted-foreground shadow-sm dark:border',
          className
        )}
        {...props}
      />
      <div
        className={cn(
          buttonVariants({ variant: 'secondary' }),
          'absolute origin-center transition-all duration-300 ease-in-out'
        )}
        style={indicatorStyle}
      />
    </div>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'z-[1] inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
