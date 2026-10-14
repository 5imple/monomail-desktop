import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useMemo } from 'react';

import { Button } from '@/renderer/app/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
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
import {
  SETTINGS_SECTION_TITLE,
  SettingsChangeDot
} from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const ComposeFormSchema = z.object({
  cancel_window: z.number({
    required_error: 'Please select a window.'
  }),
  fullscreen: z.boolean().default(false)
});

type ComposeFormValues = z.infer<typeof ComposeFormSchema>;

export function ComposeForm() {
  const { preference, member, updatePreference } = useAuth();
  const { t } = useTranslation();
  const cancelWindow = [
    { value: 5, label: t('settings.compose.undo_send.options.5') },
    { value: 10, label: t('settings.compose.undo_send.options.10') },
    { value: 15, label: t('settings.compose.undo_send.options.15') },
    { value: 20, label: t('settings.compose.undo_send.options.20') },
    { value: 30, label: t('settings.compose.undo_send.options.30') }
  ] as const;

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(ComposeFormSchema),
    defaultValues: {
      cancel_window: preference.compose.cancelWindow,
      fullscreen: preference.compose.fullscreen || false
    }
  });

  const watchCancelWindow = form.watch('cancel_window');
  const watchFullscreen = form.watch('fullscreen');

  // Determine if settings have been modified
  const isCancelWindowModified = useMemo(
    () => watchCancelWindow !== preference.compose.cancelWindow,
    [watchCancelWindow, preference.compose.cancelWindow]
  );

  // Unset counts as off (as the form reads it), or Fullscreen showed as
  // changed, and Save enabled, before anything was touched.
  const isFullscreenModified = useMemo(
    () => watchFullscreen !== (preference.compose.fullscreen ?? false),
    [watchFullscreen, preference.compose.fullscreen]
  );

  async function onSubmit(data: ComposeFormValues) {
    if (!member) return;
    try {
      await updatePreference({
        compose: {
          ...preference.compose,
          cancelWindow: data.cancel_window,
          fullscreen: data.fullscreen
        }
      });
      toast.success(t('toast.preferences.updated'));
    } catch (error) {
      console.error('Error updating compose preferences:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <div className="space-y-8">
            {/* Undo Send Setting */}
            <FormField
              control={form.control}
              name={`cancel_window`}
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
                    {t('settings.compose.undo_send.title')}
                    {isCancelWindowModified && <SettingsChangeDot />}
                  </FormLabel>
                  <FormDescription>{t('settings.compose.undo_send.description')}</FormDescription>
                  {/* A select, tied to its label (FormControl on a menu root reached
                      no element), with a chevron saying it opens. An unknown stored
                      value shows the placeholder rather than a wrong option. */}
                  <Select
                    value={
                      cancelWindow.some((window) => window.value === field.value)
                        ? String(field.value)
                        : ''
                    }
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <FormControl>
                      <SelectTrigger variant="secondary" className="w-[150px]">
                        <SelectValue
                          placeholder={t('settings.compose.undo_send.placeholder', 'Choose…')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cancelWindow.map((window) => (
                        <SelectItem key={window.value} value={String(window.value)}>
                          {window.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Fullscreen Setting */}
            <FormField
              control={form.control}
              name="fullscreen"
              render={({ field }) => (
                // space-y-0: FormItem's spacing pushed the switch ~4px below its label.
                <FormItem className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-0.5">
                    <FormLabel className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
                      {t('settings.compose.fullscreen.title')}
                      {isFullscreenModified && <SettingsChangeDot />}
                    </FormLabel>
                    <FormDescription>
                      {t('settings.compose.fullscreen.description')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <Button
            type="submit"
            disabled={
              (!isCancelWindowModified && !isFullscreenModified) || form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting
              ? t('settings.buttons.saving', 'Saving…')
              : t('settings.buttons.save_changes')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
