import MonoIcon from '@/renderer/app/components/icons/InboxIcon';
import { AlertDescription } from '@/renderer/app/components/ui/alert';
import { Button } from '@/renderer/app/components/ui/button';
import ListPanelHeader from '@/renderer/app/containers/header/ListPanelHeader';
import ThreadList from '@/renderer/app/containers/list/ThreadList';
import { ThreadListProvider } from '@/renderer/app/context/ThreadListContext';
import { useThreadListAtom } from '@/renderer/app/store/layout/threadList/useThreadListAtom';
import { useGlobalAtom } from '@/renderer/app/store/layout/useGlobalAtom';
import { FC, useRef, useState } from 'react';

interface ListPanelProps {}

const ListPanel: FC<ListPanelProps> = ({}) => {
  const { globalSearchQuery } = useGlobalAtom();
  const { notificationAlert, setNotificationAlert, dismissAlert } = useThreadListAtom();
  const threadListHeaderRef = useRef<HTMLDivElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);

  const currentAlerts = notificationAlert.filter(
    (alert) => (globalSearchQuery && globalSearchQuery === alert.query) || alert.showEverywhere
  );

  const [isScrolled, setIsScrolled] = useState(false);

  const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    // Check if at top
    const atTop = target.scrollTop === 0;
    setIsScrolled(!atTop);
  };
  return (
    <ThreadListProvider>
      <div className="no-drag flex h-screen flex-col bg-white dark:bg-background">
        <ListPanelHeader isScrolled={isScrolled} ref={threadListHeaderRef} />
        <div className="relative">
          {currentAlerts.length > 0 && (
            <div ref={alertRef} className="border-b p-2">
              {currentAlerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border p-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    {alert.icon && <MonoIcon type={alert.icon} className="mt-0.5" />}
                    <div className="flex flex-col">
                      <h4 className="text-sm font-medium">{alert.title}</h4>
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                    </div>
                    {alert.closeable && (
                      <Button
                        className="ml-auto"
                        sizeVariant={'xs'}
                        typeVariant={'icon'}
                        variant={'ghost'}
                        onClick={() => dismissAlert(alert.id)}
                      >
                        <MonoIcon type="X" />
                        <span className="sr-only">Close</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <section id="conversation-list" className="relative flex min-h-0 flex-1 flex-col">
          <ThreadList onScroll={onScroll} />
        </section>
      </div>
    </ThreadListProvider>
  );
};

export default ListPanel;
