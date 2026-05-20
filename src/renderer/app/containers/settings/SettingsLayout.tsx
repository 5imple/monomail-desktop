import SettingsDisplayPage from '@/renderer/app/containers/settings/display/SettingsDisplayPage';
import SettingsThreadListDisplayPage from '@/renderer/app/containers/settings/display/SettingsThreadListDisplayPage';
import SettingsEmailAccountPage from '@/renderer/app/containers/settings/integration/SettingsIntegrationPage';
import SettingsNotificationsPage from '@/renderer/app/containers/settings/notification/SettingsNotificationPage';
import SettingsProfilePage from '@/renderer/app/containers/settings/profile/SettingsProfilePage';
import { useEffect, useState } from 'react';

import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { Label } from '@/renderer/app/components/ui/label';
import { ScrollArea } from '@/renderer/app/components/ui/scroll-area';
import { Separator } from '@/renderer/app/components/ui/separator';
import SettingsAccountPage from '@/renderer/app/containers/settings/account/SettingsAccountPage';
import SettingsBillingPage from '@/renderer/app/containers/settings/billing/SettingsBillingPage';
import SettingsComposePage from '@/renderer/app/containers/settings/compose/SettingsComposePage';
import { LabelForm } from '@/renderer/app/containers/settings/forms/LabelForm';
import SettingsGeneralPage from '@/renderer/app/containers/settings/general/SettingsGeneralPage';
import SettingsShortcutPage from '@/renderer/app/containers/settings/shortcut/SettingsShortcutPage';
import SettingsSignaturePage from '@/renderer/app/containers/settings/signature/SettingsSignaturePage';
import SettingsSystemPage from '@/renderer/app/containers/settings/system/SettingsSystemPage';
import SettingsTemplatePage from '@/renderer/app/containers/settings/template/SettingsTemplatePage';
import { cn } from '@/renderer/app/lib/utils';
import { useDefaultNav } from '@/renderer/app/store/layout/sidebar/useSidebarAtom';
import { useTranslation } from 'react-i18next';
import SettingsDisplayInboxPage from '@/renderer/app/containers/settings/inbox/SettingsDisplayInboxPage';
import SettingsFilterPage from '@/renderer/app/containers/settings/filter/SettingsFilterPage';
import SettingsAutoPilotPage from '@/renderer/app/containers/settings/autopilot/SettingsAutoPilotPage';
import AutoPilotForm from '@/renderer/app/containers/settings/forms/AutoPilotForm';
import ToneProfileForm from '@/renderer/app/containers/settings/forms/ToneProfileForm';
import { Badge } from '@/renderer/app/components/ui/badge';

interface SidebarNavItem {
  type: 'label' | 'separator' | 'item';
  id?: string;
  title: string;
  icon?: MonoIconType;
  badge?: string;
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  items: SidebarNavItem[];
  activeItem?: string;
  onItemClick: (id: string) => void;
}

interface SettingsLayoutProps {
  defaultPage?: string;
}

export function SidebarNav({
  className,
  items,
  activeItem,
  onItemClick,
  ...props
}: SidebarNavProps) {
  return (
    <nav className={cn('flex flex-col space-x-0 space-y-0.5', className)} {...props}>
      {items.map((item, index) => {
        if (item.type === 'label') {
          // Newton section label: mono uppercase tracked, subtle muted tone.
          return (
            <Label
              className="block px-2 pb-1 pt-5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
              key={index}
            >
              {item.title}
            </Label>
          );
        } else if (item.type === 'separator') {
          return <Separator key={index} />;
        } else if (item.type === 'item' && item.id) {
          const isActive = activeItem === item.id;
          return (
            <Button
              key={item.id}
              onClick={() => onItemClick(item.id!)}
              variant={'ghost'}
              sizeVariant={'sm'}
              className={cn(
                'relative justify-start',
                isActive
                  ? 'bg-muted-low text-foreground hover:bg-muted-low hover:text-foreground'
                  : 'hover:bg-muted-low/60'
              )}
            >
              {/* Newton red leading bar marks the active item — matches the
                  unread-thread treatment so the whole app reads as one
                  consistent system. */}
              {isActive && (
                <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-accent" />
              )}
              {item.icon && (
                <MonoIcon
                  type={item.icon}
                  className={cn('mr-2', isActive ? 'text-foreground' : 'text-foreground/70')}
                />
              )}
              {item.title}
              {item.badge && (
                <Badge sizeVariant={'xs'} className="ml-auto rounded-sm">
                  {item.badge}
                </Badge>
              )}
            </Button>
          );
        }
        return null;
      })}
    </nav>
  );
}

export default function SettingsLayout({ defaultPage }: SettingsLayoutProps) {
  const [activeItem, setActiveItem] = useState(defaultPage || useDefaultNav()[0].id);
  const { t } = useTranslation();

  const sidebarNavItems: SidebarNavItem[] = [
    // GENERAL
    {
      type: 'item',
      title: t('settings.general.title'),
      id: 'general',
      icon: 'Cog',
      badge: 'New'
    },
    {
      type: 'item',
      title: t('settings.notifications.title'),
      id: 'notifications',
      icon: 'Bell'
    },
    {
      type: 'item',
      title: t('settings.shortcut.title'),
      id: 'shortcut',
      icon: 'Command'
    },

    // EMAIL
    {
      type: 'label',
      title: t('settings.email.title')
    },
    {
      type: 'item',
      title: t('settings.integration.title'),
      id: 'integration',
      icon: 'UserGroup'
    },
    {
      type: 'item',
      title: t('settings.compose.title'),
      id: 'compose',
      icon: 'Edit'
    },
    {
      type: 'item',
      title: t('settings.label.title'),
      id: 'label',
      icon: 'Label'
    },
    {
      type: 'item',
      title: t('settings.signature.title'),
      id: 'signature',
      icon: 'Pen'
    },
    {
      type: 'item',
      title: t('settings.template.title'),
      id: 'template',
      icon: 'FileText'
    },
    {
      type: 'label',
      title: t('settings.ai.title')
    },
    {
      type: 'item',
      title: t('settings.filter.title'),
      id: 'filter',
      icon: 'Filter'
    },
    {
      type: 'item',
      title: t('settings.ai.autopilot.title'),
      id: 'autopilot',
      icon: 'Sparkles'
    },
    {
      type: 'item',
      title: t('settings.ai.voiceprofiles.title'),
      id: 'voiceprofile',
      icon: 'Mic'
    },

    // DISPLAY
    {
      type: 'label',
      title: t('settings.display.title')
    },
    {
      type: 'item',
      title: t('settings.account.title'),

      icon: 'UserCircle',
      id: 'account'
    },
    {
      type: 'item',
      id: 'inbox',
      icon: 'Inbox',
      title: t('settings.display.inbox.title')
    },
    {
      type: 'item',
      id: 'threadlist',
      icon: 'List',
      title: t('settings.display.threadlist.title'),
      badge: 'New'
    },

    //PROFILE
    {
      type: 'label',
      title: t('settings.others.title')
    },
    {
      type: 'item',
      title: t('settings.profile.title'),
      id: 'profile',
      icon: 'UserIcon'
    },
    {
      type: 'item',
      title: t('settings.billing.title'),
      id: 'billing',
      icon: 'CreditCard'
    },
    {
      type: 'item',
      title: t('settings.system.title'),
      id: 'system',
      icon: 'Cog'
    }
  ];
  useEffect(() => {
    if (defaultPage) {
      setActiveItem(defaultPage);
    }
  }, [defaultPage]);

  const renderPage = () => {
    switch (activeItem) {
      case 'profile':
        return <SettingsProfilePage />;
      case 'account':
        return <SettingsAccountPage />;
      case 'integration':
        return <SettingsEmailAccountPage />;
      case 'notifications':
        return <SettingsNotificationsPage />;
      case 'shortcut':
        return <SettingsShortcutPage />;
      case 'autopilot':
        return <AutoPilotForm />;
      case 'voiceprofile':
        return <ToneProfileForm />;
      case 'general':
        return <SettingsGeneralPage />;
      case 'signature':
        return <SettingsSignaturePage />;
      case 'template':
        return <SettingsTemplatePage />;
      case 'compose':
        return <SettingsComposePage />;
      case 'inbox':
        return <SettingsDisplayInboxPage />;
      case 'threadlist':
        return <SettingsThreadListDisplayPage />;
      case 'filter':
        return <SettingsFilterPage />;
      case 'label':
        return <LabelForm />;
      case 'billing':
        return <SettingsBillingPage />;
      case 'system':
        return <SettingsSystemPage />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-row space-y-0">
          <aside className="w-[240px] shrink-0 border-r border-border/60 bg-muted/40 p-3 dark:bg-card">
            <SidebarNav
              className="w-full"
              items={sidebarNavItems}
              activeItem={activeItem}
              onItemClick={setActiveItem}
            />
          </aside>
          <div className="flex-1">
            <ScrollArea className="h-[720px] w-full" viewportClassName="p-8">
              {renderPage()}
            </ScrollArea>
          </div>
        </div>
      </div>
    </>
  );
}
