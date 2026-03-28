import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useMemo } from 'react';

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
import { useAuth } from '@/renderer/app/context/AuthContext';
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

  const isFullscreenModified = useMemo(
    () => watchFullscreen !== preference.compose.fullscreen,
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
                  <FormLabel className="flex items-center gap-2 text-foreground">
                    {t('settings.compose.undo_send.title')}
                    {isCancelWindowModified && <div className="h-2 w-2 rounded-full bg-accent" />}
                  </FormLabel>
                  <FormDescription>{t('settings.compose.undo_send.description')}</FormDescription>
                  <FormControl>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="secondary" className="w-[150px] justify-between">
                          {cancelWindow.find((window) => window.value === field.value)?.label ||
                            'Select label'}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuGroup>
                          {cancelWindow.map((window) => (
                            <DropdownMenuCheckboxItem
                              key={window.value}
                              checked={field.value === window.value}
                              onClick={() => form.setValue(`cancel_window`, window.value)}
                            >
                              {window.label}
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

            {/* Fullscreen Setting */}
            <FormField
              control={form.control}
              name="fullscreen"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between">
                  <div className="space-y-0.5">
                    <FormLabel className="flex items-center gap-2 text-sm text-foreground">
                      {t('settings.compose.fullscreen.title')}
                      {isFullscreenModified && <div className="h-2 w-2 rounded-full bg-accent" />}
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
          <Button type="submit">{t('settings.buttons.save_changes')}</Button>
        </div>
      </form>
    </Form>
  );
}
