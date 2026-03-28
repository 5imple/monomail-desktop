import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
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
import { Switch } from '@/renderer/app/components/ui/switch';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { toast } from 'sonner';
import { ResetCacheButton } from './system/ResetCacheButton'; // Import the new component

const SystemFormSchema = z.object({
  openAtLogin: z.boolean().default(false)
});

type SystemFormValues = z.infer<typeof SystemFormSchema>;

export function SystemForm() {
  const { t } = useTranslation();
  const { preference, updatePreference } = useAuth();
  const [isAutoStartEnabled, setIsAutoStartEnabled] = useState(false);

  // Fetch the current auto-start setting from the system on component mount
  useEffect(() => {
    const fetchAutoStartEnabled = async () => {
      try {
        const isEnabled = await electronApi.getAutoStartEnabled();
        setIsAutoStartEnabled(isEnabled);
      } catch (error) {
        console.error('Failed to get auto-start status:', error);
      }
    };

    fetchAutoStartEnabled();
  }, []);

  const form = useForm<SystemFormValues>({
    resolver: zodResolver(SystemFormSchema),
    defaultValues: {
      openAtLogin: isAutoStartEnabled
    }
  });

  // Update the form value when the system setting is fetched
  useEffect(() => {
    form.setValue('openAtLogin', isAutoStartEnabled);
  }, [isAutoStartEnabled, form]);

  const watchOpenAtLogin = form.watch('openAtLogin');

  // Check if the setting has been modified
  const isOpenAtLoginModified = useMemo(
    () => watchOpenAtLogin !== isAutoStartEnabled,
    [watchOpenAtLogin, isAutoStartEnabled]
  );

  async function onSubmit(data: SystemFormValues) {
    try {
      // Only toggle if the value has changed
      if (data.openAtLogin !== isAutoStartEnabled) {
        await electronApi.toggleAutoStart();
        setIsAutoStartEnabled(data.openAtLogin);
      }

      // Update user preference if needed
      updatePreference({
        system: {
          ...preference.system,
          openAtLogin: data.openAtLogin
        }
      });

      toast.success(t('settings.system.save_success'));
    } catch (error) {
      toast.error(t('settings.system.save_error'));
      console.error('Error updating system settings:', error);
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="openAtLogin"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center gap-2 text-sm text-foreground">
                      {t('settings.system.open_at_login.title')}
                      {isOpenAtLoginModified && <div className="h-2 w-2 rounded-full bg-accent" />}
                    </FormLabel>
                    <FormDescription>
                      {t('settings.system.open_at_login.description')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          {/* Add a new section for cache management */}
          <div>
            <p className="text-sm">
              {t('settings.system.cache.description', 'Manage local cache for emails and messages')}
            </p>
            <div className="flex flex-col space-y-4 text-sm">
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
          <Button type="submit">{t('settings.buttons.save_changes')}</Button>
        </form>
      </Form>
    </div>
  );
}
