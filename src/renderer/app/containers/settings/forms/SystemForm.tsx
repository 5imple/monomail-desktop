import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/renderer/app/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel
} from '@/renderer/app/components/ui/form';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Switch } from '@/renderer/app/components/ui/switch';
import {
  SETTINGS_SECTION_TITLE,
  SettingsChangeDot
} from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { cn } from '@/renderer/app/lib/utils';
import { toast } from 'sonner';
import { ResetCacheButton } from './system/ResetCacheButton'; // Import the new component

const SystemFormSchema = z.object({
  openAtLogin: z.boolean().default(false)
});

type SystemFormValues = z.infer<typeof SystemFormSchema>;

export function SystemForm() {
  const { t } = useTranslation();
  const { preference, updatePreference } = useAuth();
  // The login item as the OS reports it; null until it has answered. It used
  // to start as false, so the switch flipped on after opening, and a toggle
  // made before the answer was overwritten by it.
  const [autoStart, setAutoStart] = useState<boolean | null>(null);

  const form = useForm<SystemFormValues>({
    resolver: zodResolver(SystemFormSchema),
    defaultValues: {
      openAtLogin: false
    }
  });

  // Fetch the current auto-start setting from the system on component mount
  useEffect(() => {
    let cancelled = false;
    const apply = (enabled: boolean) => {
      if (cancelled) return;
      setAutoStart(enabled);
      // reset, not setValue: the loaded value isn't an edit.
      form.reset({ openAtLogin: enabled });
    };
    // Through a promise: in Electron this is an IPC call, outside it a plain value.
    Promise.resolve()
      .then(() => electronApi.getAutoStartEnabled())
      .then(apply)
      .catch((error) => {
        console.error('Failed to get auto-start status:', error);
        // Never leave the switch stuck disabled: fall back to the saved setting.
        apply(preference.system?.openAtLogin ?? false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const watchOpenAtLogin = form.watch('openAtLogin');

  // Check if the setting has been modified
  const isOpenAtLoginModified = autoStart !== null && watchOpenAtLogin !== autoStart;

  async function onSubmit(data: SystemFormValues) {
    try {
      let enabled = data.openAtLogin;
      // Only toggle if the value has changed
      if (data.openAtLogin !== autoStart) {
        await electronApi.toggleAutoStart();
        // Toggling isn't idempotent, so read back what the OS now has and
        // show that.
        enabled = await electronApi.getAutoStartEnabled();
        setAutoStart(enabled);
        form.reset({ openAtLogin: enabled });
      }

      // Update user preference if needed
      await updatePreference({
        system: {
          ...preference.system,
          openAtLogin: enabled
        }
      });

      toast.success(t('settings.system.save_success'));
    } catch (error) {
      toast.error(t('settings.system.save_error'));
      console.error('Error updating system settings:', error);
    }
  }

  return (
    <div className="space-y-8">
      <Form {...form}>
        {/* Save sits right under the one setting it saves; the cache reset
            below it used to sit inside this form, as if Save committed it. */}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="openAtLogin"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between">
                <div className="space-y-0.5">
                  <FormLabel className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
                    {t('settings.system.open_at_login.title')}
                    {isOpenAtLoginModified && <SettingsChangeDot />}
                  </FormLabel>
                  <FormDescription>
                    {t('settings.system.open_at_login.description')}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={autoStart === null}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button type="submit" disabled={!isOpenAtLoginModified || form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? t('settings.buttons.saving', 'Saving…')
              : t('settings.buttons.save_changes')}
          </Button>
        </form>
      </Form>

      <Separator />

      {/* Cache management, its own section */}
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className={SETTINGS_SECTION_TITLE}>{t('settings.system.cache.title', 'Storage')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.system.cache.description', 'Manage local cache for emails and messages')}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.system.cache.info',
            'Resetting the cache will clear all locally stored emails and they will be re-downloaded when you next access them.'
          )}
        </p>
        <div>
          <ResetCacheButton />
        </div>
      </div>
    </div>
  );
}
