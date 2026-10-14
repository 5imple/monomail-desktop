import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useTheme } from '@/renderer/app/components/ThemeProvider';
import { Button } from '@/renderer/app/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/renderer/app/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/renderer/app/components/ui/radio-group';
import { useAuth } from '@/renderer/app/context/AuthContext';
import electronApi from '@/renderer/app/lib/electronApi';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SETTINGS_SECTION_TITLE,
  SettingsChangeDot
} from '@/renderer/app/containers/settings/SettingsPageHeader';
import { cn } from '@/renderer/app/lib/utils';

const GeneralFormSchema = z.object({
  theme: z.enum(['light', 'dark', 'black', 'pure-light', 'system'], {
    required_error: 'Please select a theme.'
  }),
  density: z.enum(['compact', 'cozy'], {
    required_error: 'Please select a density.'
  })
});

type GeneralFormValues = z.infer<typeof GeneralFormSchema>;

// Radio option labels read as choices, not as disabled grey text.
const OPTION_LABEL = 'cursor-pointer font-normal text-foreground';

export function GeneralForm() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const { preference, member, updatePreference } = useAuth();

  const form = useForm<GeneralFormValues>({
    resolver: zodResolver(GeneralFormSchema),
    defaultValues: {
      theme: theme,
      density: preference.appearance.density
    }
  });

  const watchTheme = form.watch('theme');
  const watchDensity = form.watch('density');

  // Determine if theme or density has been modified
  const isThemeModified = useMemo(() => watchTheme !== theme, [watchTheme, theme]);
  const isDensityModified = useMemo(
    () => watchDensity !== preference.appearance.density,
    [watchDensity, preference.appearance.density]
  );

  const isModified = isThemeModified || isDensityModified;

  const density = [
    { value: 'compact', label: t('settings.general.density.compact') },
    { value: 'cozy', label: t('settings.general.density.cozy') }
  ] as const;

  async function onSubmit(data: GeneralFormValues) {
    if (!member) return;
    setTheme(data.theme);
    electronApi.changeAppearance(data.theme);
    try {
      // Awaited: "Preferences updated" used to show before anything was saved,
      // and a failed save never reached the catch below.
      await updatePreference({
        appearance: { theme: data.theme, density: data.density }
      });
      toast.success(t('toast.preferences.updated'));
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-8">
          {/* Theme Selection */}
          <FormField
            control={form.control}
            name="theme"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
                  {t('settings.general.theme.title')}
                  {isThemeModified && <SettingsChangeDot />}
                </FormLabel>
                <FormDescription>{t('settings.general.theme.description')}</FormDescription>
                <FormMessage />
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-rows-5 pt-2"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="light" />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {t('settings.general.theme.light')}
                    </FormLabel>
                  </FormItem>

                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="pure-light" />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {t('settings.general.theme.pure_light')}
                    </FormLabel>
                  </FormItem>

                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="dark" />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {t('settings.general.theme.dark')}
                    </FormLabel>{' '}
                  </FormItem>

                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="black" />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {t('settings.general.theme.black')}
                    </FormLabel>
                  </FormItem>

                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="system" />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {t('settings.general.theme.system')}
                    </FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormItem>
            )}
          />

          {/* Density Selection */}
          <FormField
            control={form.control}
            name="density"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className={cn('flex items-center gap-2', SETTINGS_SECTION_TITLE)}>
                  {t('settings.general.density.title')}
                  {isDensityModified && <SettingsChangeDot />}
                </FormLabel>
                <FormDescription>{t('settings.general.density.description')}</FormDescription>
                <FormMessage />
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-rows-2 pt-2"
                >
                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value={'compact'} />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {density.find((d) => d.value === 'compact')?.label}
                    </FormLabel>
                  </FormItem>

                  <FormItem className="flex items-center space-x-3 space-y-0">
                    <FormControl>
                      <RadioGroupItem value={'cozy'} />
                    </FormControl>
                    <FormLabel className={OPTION_LABEL}>
                      {density.find((d) => d.value === 'cozy')?.label}
                    </FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormItem>
            )}
          />
        </div>
        <Button type="submit" disabled={!isModified || form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? t('settings.buttons.saving', 'Saving…')
            : t('settings.buttons.save_changes')}
        </Button>
      </form>
    </Form>
  );
}
