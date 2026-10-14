import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { isBackendConfigured } from '@/main/api/apiClient';
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
import {
  SETTINGS_SECTION_TITLE,
  SettingsChangeDot
} from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { AudioType, playSound } from '@/renderer/app/lib/soundManager';
import { cn } from '@/renderer/app/lib/utils';
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

      const currentWatchNotification = localPreference.notification.watchNotification;
      // What gets saved: an account whose change couldn't be applied keeps its
      // previous value. The page and the saved preference used to claim the new
      // one, under both an error and an "updated" toast.
      const watchNotification = { ...data.watch_notification } as Record<string, NotificationType>;
      const failed: string[] = [];

      // Update notification preferences for each account without stopping/restarting
      for (const uid in data.watch_notification) {
        const newValue = data.watch_notification[uid];
        const currentValue = currentWatchNotification[uid];

        // Only update if the value has changed
        if (newValue !== currentValue) {
          try {
            // Just update the notification preference using the electron API
            // This patches the preference without restarting any watches
            await electronApi.setNotificationPreference(uid, newValue);
          } catch (error) {
            console.error('Error updating notification preferences:', error);
            failed.push(uid);
            watchNotification[uid] = currentValue ?? 'PRIMARY';
          }
        }
      }

      const notification = {
        alertSound: data.alert_sound,
        watchNotification,
        marketingEmails: data.marketing_emails,
        securityEmails: data.security_emails
      };

      // Update the local preference state to reflect the new values
      const updatedPreference: UserPreference = {
        ...localPreference,
        notification: { ...localPreference.notification, ...notification }
      };

      setLocalPreference(updatedPreference);

      // Also update the global preference if updatePreference is available
      if (updatePreference) {
        await updatePreference({ notification });
      }

      if (failed.length > 0) {
        failed.forEach((uid) =>
          form.setValue(
            `watch_notification.${uid}`,
            watchNotification[uid] as 'INBOX' | 'PRIMARY' | 'OFF'
          )
        );
        toast.error(t('toast.error.preference_update'));
        return;
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
      // Unset means the default, as initialWatchNotifications reads it.
      ([uid, value]) => value !== (localPreference.notification.watchNotification[uid] ?? 'PRIMARY')
    );
  }, [watchNotification, localPreference]);
  // (Security emails can't be switched off.)
  const isModified =
    isAlertSoundModified || isWatchNotificationModified || isMarketingEmailsModified;

  // Primary account first, as a copy: sorting the context's array in place,
  // with a comparator that ignored its second argument, reordered it for
  // everyone and not deterministically.
  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (a, b) => Number(b.uid === member?.primaryUid) - Number(a.uid === member?.primaryUid)
      ),
    [accounts, member?.primaryUid]
  );

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
                  <FormLabel className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
                    {t('settings.notifications.alert_sound.title')}
                    {isAlertSoundModified && <SettingsChangeDot />}
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
                              ?.label || t('settings.notifications.choose', 'Choose…')}
                            {/* A chevron says it's a menu (it read as a static box). */}
                            <MonoIcon
                              type="ChevronDown"
                              className="h-4 w-4 text-muted-foreground"
                            />
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
                        tooltip={t('settings.notifications.alert_sound.preview', 'Preview sound')}
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
        <div className="space-y-3">
          {/* The per-account table had no heading saying what its menus choose. */}
          <div className="space-y-1">
            <h3 className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
              {t('settings.notifications.watch_notification.title')}
              {isWatchNotificationModified && <SettingsChangeDot />}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.notifications.watch_notification.description')}
            </p>
          </div>
          <div className="overflow-hidden rounded-md border shadow-sm">
            <Table>
              <TableBody>
                {sortedAccounts.length > 0 ? (
                  sortedAccounts.map((account) => (
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
                                      )?.label || t('settings.notifications.choose', 'Choose…')}
                                      <MonoIcon
                                        type="ChevronDown"
                                        className="h-4 w-4 text-muted-foreground"
                                      />
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
                    <TableCell className="text-muted-foreground">
                      {t('settings.notifications.no_accounts', 'No accounts connected')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        {/* Marketing and security emails would come from a Mono backend; without
            one these switches did nothing. */}
        {isBackendConfigured() && (
          <div>
            <h3 className={cn('mb-4', SETTINGS_SECTION_TITLE)}>
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
                        {isMarketingEmailsModified && <SettingsChangeDot />}
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
        )}
        <Button type="submit" disabled={!isModified || form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? t('settings.buttons.saving', 'Saving…')
            : t('settings.buttons.save_changes')}
        </Button>
      </form>
    </Form>
  );
}
