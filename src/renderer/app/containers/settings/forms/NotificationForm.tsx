import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import authApi from '@/main/api/auth/authApi';
import { NotificationType, UserPreference } from '@/main/api/auth/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AccountList from '@/renderer/app/components/ui/account-list';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/renderer/app/components/ui/form';
import { Switch } from '@/renderer/app/components/ui/switch';
import { Table, TableBody, TableCell, TableRow } from '@/renderer/app/components/ui/table';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { AudioType, playSound } from '@/renderer/app/lib/soundManager';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

// Zod schema with dynamic keys for watch_notification by account uid
const notificationsFormSchema = z.object({
  alert_sound: z.enum(['Off', 'Mono', 'Shuffle', 'Ping', 'Swipe', 'Ripple']).default('Mono'),
  watch_notification: z.record(z.string(), z.enum(['INBOX', 'PRIMARY', 'OFF'])),
  marketing_emails: z.boolean().default(false),
  security_emails: z.boolean().default(true)
});

type NotificationsFormValues = z.infer<typeof notificationsFormSchema>;

export function NotificationsForm() {
  const { preference, member, accounts, updatePreference } = useAuth();
  const { t } = useTranslation();

  // Add local state to track the current saved preferences
  const [localPreference, setLocalPreference] = useState(preference);

  const watchNotificationOptions = [
    { label: t('settings.notifications.watch_notification.options.inbox'), value: 'INBOX' },
    // { label: t('settings.notifications.watch_notification.options.important'), value: 'IMPORTANT' },
    { label: t('settings.notifications.watch_notification.options.primary'), value: 'PRIMARY' },
    { label: t('settings.notifications.watch_notification.options.off'), value: 'OFF' }
  ] as const;

  const alertSoundOptions = [
    { label: t('settings.notifications.alert_sound.options.off'), value: 'Off' },
    { label: t('settings.notifications.alert_sound.options.mono'), value: 'Mono' },
    { label: t('settings.notifications.alert_sound.options.shuffle'), value: 'Shuffle' },
    { label: t('settings.notifications.alert_sound.options.ping'), value: 'Ping' },
    { label: t('settings.notifications.alert_sound.options.swipe'), value: 'Swipe' },
    { label: t('settings.notifications.alert_sound.options.ripple'), value: 'Ripple' }
  ] as const;

  // Create default values for each account's watch_notification setting
  const initialWatchNotifications = accounts.reduce(
    (acc, account) => {
      acc[account.uid] = localPreference.notification.watchNotification[account.uid] || 'PRIMARY';
      return acc;
    },
    {} as Record<string, 'INBOX' | 'PRIMARY' | 'OFF'>
  );

  const form = useForm<NotificationsFormValues>({
    resolver: zodResolver(notificationsFormSchema),
    defaultValues: {
      alert_sound: localPreference.notification.alertSound,
      watch_notification: initialWatchNotifications,
      marketing_emails: localPreference.notification.marketingEmails,
      security_emails: localPreference.notification.securityEmails
    }
  });

  async function onSubmit(data: NotificationsFormValues) {
    if (!member) return;
    try {
      await authApi.updateUserPreference({
        notification: {
          alertSound: data.alert_sound,
          watchNotification: data.watch_notification as Record<string, NotificationType>,
          marketingEmails: data.marketing_emails,
          securityEmails: data.security_emails
        }
      });

      const updatedWatchNotification = data.watch_notification;
      const currentWatchNotification = localPreference.notification.watchNotification;

      // Update notification preferences for each account without stopping/restarting
      for (const uid in updatedWatchNotification) {
        const newValue = updatedWatchNotification[uid];
        const currentValue = currentWatchNotification[uid];

        // Only update if the value has changed
        if (newValue !== currentValue) {
          try {
            // Just update the notification preference using the electron API
            // This patches the preference without restarting any watches
            await electronApi.setNotificationPreference(uid, newValue);
          } catch (error) {
            console.error('Error updating notification preferences:', error);
            toast.error(t('toast.error.preference_update'));
          }
        }
      }

      // Update the local preference state to reflect the new values
      const updatedPreference: UserPreference = {
        ...localPreference,
        notification: {
          ...localPreference.notification,
          alertSound: data.alert_sound,
          watchNotification: data.watch_notification as Record<string, NotificationType>,
          marketingEmails: data.marketing_emails,
          securityEmails: data.security_emails
        }
      };

      setLocalPreference(updatedPreference);

      // Also update the global preference if updatePreference is available
      if (updatePreference) {
        updatePreference({
          notification: {
            alertSound: data.alert_sound,
            watchNotification: data.watch_notification as Record<string, NotificationType>,
            marketingEmails: data.marketing_emails,
            securityEmails: data.security_emails
          }
        });
      }

      toast.success(t('toast.preferences.updated'));
    } catch (e) {
      toast.error(t('toast.error.preference_update'));
      console.error(e);
    }
  }

  const handlePlayAudio = (audio: string) => {
    playSound(audio as AudioType);
  };

  const watchAlertSound = form.watch('alert_sound');
  const watchMarketingEmails = form.watch('marketing_emails');
  const watchSecurityEmails = form.watch('security_emails');
  const watchNotification = form.watch('watch_notification');

  // Determine if settings have been modified
  const isAlertSoundModified = useMemo(
    () => watchAlertSound !== localPreference.notification.alertSound,
    [watchAlertSound, localPreference]
  );
  const isMarketingEmailsModified = useMemo(
    () => watchMarketingEmails !== localPreference.notification.marketingEmails,
    [watchMarketingEmails, localPreference]
  );
  const isSecurityEmailsModified = useMemo(
    () => watchSecurityEmails !== localPreference.notification.securityEmails,
    [watchSecurityEmails, localPreference]
  );
  const isWatchNotificationModified = useMemo(() => {
    return Object.entries(watchNotification).some(
      ([uid, value]) => value !== localPreference.notification.watchNotification[uid]
    );
  }, [watchNotification, localPreference]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name={`alert_sound`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2 text-foreground">
                    {t('settings.notifications.alert_sound.title')}
                    {isAlertSoundModified && <div className="h-2 w-2 rounded-full bg-accent" />}
                  </FormLabel>
                  <FormDescription>
                    {t('settings.notifications.alert_sound.description')}
                  </FormDescription>
                  <div className="flex gap-0">
                    <FormControl>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant={'secondary'} className="w-[150px] justify-between">
                            {alertSoundOptions.find((sound) => sound.value === field.value)
                              ?.label || 'Select label'}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuGroup>
                            {alertSoundOptions.map((sound) => (
                              <DropdownMenuCheckboxItem
                                key={sound.value}
                                checked={field.value === sound.value}
                                onClick={() => {
                                  playSound(sound.value as AudioType);
                                  form.setValue(`alert_sound`, sound.value);
                                }}
                              >
                                {sound.label}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </FormControl>
                    {field.value !== 'Off' && (
                      <Button
                        onClick={() => handlePlayAudio(field.value)}
                        variant={'text'}
                        typeVariant={'icon'}
                        type={'button'}
                      >
                        <MonoIcon type={'PlayCircle'} />
                      </Button>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
        <div>
          <div className="overflow-hidden rounded-md border shadow-sm">
            <Table>
              <TableBody>
                {accounts.length > 0 ? (
                  accounts
                    .sort((a) => (a.uid === member?.primaryUid ? -1 : 1))
                    .map((account) => (
                      <TableRow key={account.email}>
                        <TableCell className="h-12 p-4">
                          <AccountList accounts={[account]} />
                        </TableCell>
                        <TableCell className="h-12 text-end">
                          {/* Render the dropdown menu for watch notification */}
                          <FormField
                            control={form.control}
                            name={`watch_notification.${account.uid}`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="secondary"
                                        className="w-[150px] justify-between"
                                      >
                                        {watchNotificationOptions.find(
                                          (notification) => notification.value === field.value
                                        )?.label || 'Select label'}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      <DropdownMenuGroup>
                                        {watchNotificationOptions.map((notification) => (
                                          <DropdownMenuCheckboxItem
                                            key={notification.value}
                                            checked={field.value === notification.value}
                                            onClick={() =>
                                              form.setValue(
                                                `watch_notification.${account.uid}`,
                                                notification.value
                                              )
                                            }
                                          >
                                            {notification.label}
                                          </DropdownMenuCheckboxItem>
                                        ))}
                                      </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow key={'no_account'}>
                    <TableCell className="text-muted-foreground">No user found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div>
          <h3 className="mb-4 text-lg font-medium">
            {t('settings.notifications.email_notifications')}
          </h3>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="marketing_emails"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center gap-2 text-sm text-foreground">
                      {t('settings.notifications.marketing_emails.title')}
                      {isMarketingEmailsModified && (
                        <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                      )}
                    </FormLabel>
                    <FormDescription>
                      {t('settings.notifications.marketing_emails.description')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="security_emails"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="text-sm text-foreground">
                      {t('settings.notifications.security_emails.title')}
                    </FormLabel>
                    <FormDescription>
                      {t('settings.notifications.security_emails.description')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled
                      aria-readonly
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>
        <Button type="submit">{t('settings.buttons.save_changes')}</Button>
      </form>
    </Form>
  );
}
