import MonoIcon from '@/renderer/app/components/icons/icons';
import Loader from '@/renderer/app/components/ui/loader';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'dark' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster no-drag dark group ease-bouncy-in-out"
      position={'bottom-center'}
      pauseWhenPageIsHidden
      offset={50}
      gap={8}
      toastOptions={{
        classNames: {
          icon: '[&>svg]:w-[1.1rem] [&>svg]:h-[1.1rem] m-0 mx-1 w-4 h-4 group-data-[type=error]:text-red-500 group-data-[type=success]:text-green-500 group-data-[type=warning]:text-amber-500 group-data-[type=info]:text-foreground',
          toast:
            'group p-3 min-h-14 toast group-[.toaster]:bg-gradient-to-t from-secondary dark:from-background dark:to-secondary to-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-xl border rounded-xl group-[.toaster]:pointer-events-auto',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      icons={{
        info: <MonoIcon type={'AlertCircle'} />,
        error: <MonoIcon type={'AlertCircle'} />,
        success: <MonoIcon type={'CheckCircle'} />,
        loading: <Loader />
      }}
      {...props}
    />
  );
};

export { Toaster };
