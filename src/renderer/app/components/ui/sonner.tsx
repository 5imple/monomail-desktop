import MonoIcon from '@/renderer/app/components/icons/icons';
import Loader from '@/renderer/app/components/ui/loader';
import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * The messages after an action ("Sending in 5s · Undo", "Archived · Undo",
 * errors) sit in the bottom-left corner as one plain line: no card gradient,
 * a text-style action, no check mark on a success (the words say it). Their
 * look is in global.css (".toaster" bottom-left rules). The selection bar is
 * a toast too, but bottom-center with its own look (ThreadSelectionToast).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // 'black' and 'pure-light' are dark/light variants respectively — sonner only
  // understands light/dark/system, so fold the app's 4-theme model down to that.
  const { currentTheme } = useTheme();
  const sonnerTheme: ToasterProps['theme'] =
    currentTheme === 'black' ? 'dark' : currentTheme === 'pure-light' ? 'light' : currentTheme;

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster no-drag group ease-bouncy-in-out"
      position="bottom-left"
      pauseWhenPageIsHidden
      offset={16}
      gap={8}
      toastOptions={{
        classNames: {
          icon: '[&>svg]:w-4 [&>svg]:h-4 m-0 w-4 h-4 group-data-[type=error]:text-destructive group-data-[type=warning]:text-secondary-accent group-data-[type=info]:text-muted-foreground',
          toast: 'group toast group-[.toaster]:pointer-events-auto',
          description: 'group-[.toast]:text-muted-foreground'
        }
      }}
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
