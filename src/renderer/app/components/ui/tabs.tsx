import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/renderer/app/lib/utils';
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
  // The first placement lands without the slide; only later moves animate
  // (it grew in from the left edge on every mount).
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    const root = tabsListRef.current;
    if (!root) return;
    let frame = 0;
    const updateIndicator = () => {
      const activeTab = root.querySelector<HTMLElement>('[data-state="active"]');
      if (!activeTab) return;
      // Undo any scale on the way: these lists open inside zoom-in-95
      // popovers, and a mid-animation rect left the indicator small and off
      // until the next change. (Offsets avoid it too, but round to whole
      // pixels.)
      const rootRect = root.getBoundingClientRect();
      const measured = root.offsetWidth ? rootRect.width / root.offsetWidth : 1;
      if (!measured) return;
      const scale = Math.abs(measured - 1) < 0.01 ? 1 : measured;
      const tabRect = activeTab.getBoundingClientRect();
      setIndicatorStyle({
        left: (tabRect.left - rootRect.left) / scale,
        top: (tabRect.top - rootRect.top) / scale,
        width: tabRect.width / scale,
        height: tabRect.height / scale,
        opacity: 1
      });
      if (!frame) frame = requestAnimationFrame(() => setAnimate(true));
    };

    updateIndicator();
    const observer = new MutationObserver(updateIndicator);
    observer.observe(root, {
      attributes: true,
      childList: true,
      subtree: true
    });
    // Size changes (fonts loading, the panel resizing) move the tabs too.
    const resizeObserver = new ResizeObserver(updateIndicator);
    resizeObserver.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
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
          'absolute origin-center',
          animate && 'transition-all duration-300 ease-in-out'
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
