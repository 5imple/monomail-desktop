import MonoIcon from '@/renderer/app/components/icons/icons';
import Loader from '@/renderer/app/components/ui/loader';
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // 'black' and 'pure-light' are dark/light variants respectively — sonner only
  // understands light/dark/system, so fold the app's 4-theme model down to that.
  const { currentTheme } = useTheme();
  const sonnerTheme: ToasterProps['theme'] = currentTheme === 'black' ? 'dark' : currentTheme === 'pure-light' ? 'light' : currentTheme;

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster no-drag group ease-bouncy-in-out"
      position={'bottom-center'}
      pauseWhenPageIsHidden
      offset={50}
      gap={8}
      toastOptions={{
        classNames: {
          icon: '[&>svg]:w-[1.1rem] [&>svg]:h-[1.1rem] m-0 mx-1 w-4 h-4 group-data-[type=error]:text-destructive group-data-[type=success]:text-chart-1 group-data-[type=warning]:text-secondary-accent group-data-[type=info]:text-foreground',
          toast:
            'group p-3 min-h-14 toast group-[.toaster]:bg-gradient-to-t from-secondary dark:from-background dark:to-secondary to-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl border rounded-xl group-[.toaster]:pointer-events-auto',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      // Theme tokens for the icon colors above (rose, lime, amber), and a
      // warning icon of ours rather than sonner's own triangle.
      icons={{
        info: <MonoIcon type={'AlertCircle'} />,
        warning: <MonoIcon type={'AlertCircle'} />,
        error: <MonoIcon type={'AlertCircle'} />,
        success: <MonoIcon type={'CheckCircle'} />,
        loading: <Loader />
      }}
      {...props}
    />
  );
};

export { Toaster };
