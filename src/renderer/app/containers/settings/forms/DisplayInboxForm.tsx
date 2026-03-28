import authApi from '@/main/api/auth/authApi';
import { UserPreference } from '@/main/api/auth/types';
import { Button, buttonVariants } from '@/renderer/app/components/ui/button';
import { Form, FormControl, FormField, FormItem } from '@/renderer/app/components/ui/form';
import { Switch } from '@/renderer/app/components/ui/switch';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { cn } from '@/renderer/app/lib/utils';
import electronApi from '@/renderer/app/lib/electronApi';

// Zod schema for inbox category preferences
const inboxCategoryFormSchema = z.object({
  showPromotions: z.boolean().default(true),
  showSocial: z.boolean().default(true),
  showUpdates: z.boolean().default(true),
  showForums: z.boolean().default(true)
});

type InboxCategoryFormValues = z.infer<typeof inboxCategoryFormSchema>;

export function DisplayInboxForm() {
  const { preference, updatePreference, accounts } = useAuth();
  const { t } = useTranslation();

  // Local copy of preference so we can reflect fresh updates immediately
  const [localPreference, setLocalPreference] = useState(preference);

  // Account handling (similar to LabelForm)
  const accountUids = useMemo(() => accounts.map((acc) => acc.uid), [accounts]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accountUids[0] ?? '');

  // If accounts load later, ensure a default is selected
  useEffect(() => {
    if (accountUids.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountUids[0]);
    }
  }, [accountUids, selectedAccountId]);

  // Map account uid -> email for display
  const accountEmailMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((acc) => {
      map[acc.uid] = acc.email || acc.uid;
    });
    return map;
  }, [accounts]);

  const form = useForm<InboxCategoryFormValues>({
    resolver: zodResolver(inboxCategoryFormSchema),
    defaultValues: {
      showPromotions:
        preference.display.inbox.category?.[selectedAccountId]?.showPromotions ?? true,
      showSocial: preference.display.inbox.category?.[selectedAccountId]?.showSocial ?? true,
      showUpdates: preference.display.inbox.category?.[selectedAccountId]?.showUpdates ?? true,
      showForums: preference.display.inbox.category?.[selectedAccountId]?.showForums ?? true
    }
  });

  // When preference or selected account changes, reset form values
  useEffect(() => {
    if (!selectedAccountId) return;

    const categoryPrefs = localPreference.display.inbox?.category?.[selectedAccountId] ?? {
      showPromotions:
        preference.display.inbox.category?.[selectedAccountId]?.showPromotions ?? true,
      showSocial: preference.display.inbox.category?.[selectedAccountId]?.showSocial ?? true,
      showUpdates: preference.display.inbox.category?.[selectedAccountId]?.showUpdates ?? true,
      showForums: preference.display.inbox.category?.[selectedAccountId]?.showForums ?? true
    };

    form.reset({
      showPromotions: categoryPrefs.showPromotions,
      showSocial: categoryPrefs.showSocial,
      showUpdates: categoryPrefs.showUpdates,
      showForums: categoryPrefs.showForums
    });
  }, [localPreference, selectedAccountId, form]);

  async function onSubmit(data: InboxCategoryFormValues) {
    try {
      if (!selectedAccountId) return;

      // Build updated category preference for the selected account
      const updatedCategoryPrefs = {
        ...localPreference.display.inbox.category?.[selectedAccountId],
        ...data
      };

      // Build full updated preference object
      const updatedPreference: UserPreference = {
        ...localPreference,
        display: {
          ...localPreference.display,
          inbox: {
            category: {
              ...localPreference.display.inbox?.category,
              [selectedAccountId]: updatedCategoryPrefs
            }
          }
        }
      };

      // Persist to server
      await authApi.updateUserPreference({
        display: {
          inbox: {
            category: {
              [selectedAccountId]: updatedCategoryPrefs
            }
          },
          threadList: localPreference.display.threadList
        }
      });

      setLocalPreference(updatedPreference);

      // Update global preference state
      if (updatePreference) {
        updatePreference({ display: updatedPreference.display });
      }

      // Update electron with the new category preferences
      electronApi.setSplitCategoryPreferences(selectedAccountId, updatedCategoryPrefs);

      toast.success(t('toast.preferences.updated'));
    } catch (error) {
      console.error('Error updating inbox category preferences:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  // Watch all form values
  const watchShowPromotions = form.watch('showPromotions');
  const watchShowSocial = form.watch('showSocial');
  const watchShowUpdates = form.watch('showUpdates');
  const watchShowForums = form.watch('showForums');

  // Determine if settings have been modified
  const isModified = useMemo(() => {
    const currentPrefs = localPreference.display.inbox?.category?.[selectedAccountId] ?? {
      showPromotions:
        preference.display.inbox.category?.[selectedAccountId]?.showPromotions ?? false,
      showSocial: preference.display.inbox.category?.[selectedAccountId]?.showSocial ?? false,
      showUpdates: preference.display.inbox.category?.[selectedAccountId]?.showUpdates ?? true,
      showForums: preference.display.inbox.category?.[selectedAccountId]?.showForums ?? false
    };

    return (
      watchShowPromotions !== currentPrefs.showPromotions ||
      watchShowSocial !== currentPrefs.showSocial ||
      watchShowUpdates !== currentPrefs.showUpdates ||
      watchShowForums !== currentPrefs.showForums
    );
  }, [
    watchShowPromotions,
    watchShowSocial,
    watchShowUpdates,
    watchShowForums,
    localPreference,
    selectedAccountId
  ]);

  // Category settings for easy rendering
  const categorySettings = [
    {
      name: 'showPromotions',
      title: t('settings.display.inbox.category.promotions'),
      description: t('settings.display.inbox.category.promotions_description')
    },
    {
      name: 'showSocial',
      title: t('settings.display.inbox.category.social'),
      description: t('settings.display.inbox.category.social_description')
    },
    {
      name: 'showUpdates',
      title: t('settings.display.inbox.category.updates'),
      description: t('settings.display.inbox.category.updates_description')
    },
    {
      name: 'showForums',
      title: t('settings.display.inbox.category.forums'),
      description: t('settings.display.inbox.category.forums_description')
    }
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="mb-4 flex items-start">
          <div>
            <h3 className="text-lg font-medium">{t('settings.display.inbox.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.display.inbox.description')}
            </p>
          </div>

          <div className="ml-auto flex gap-2">
            {/* Account selector */}
            {accountUids.length > 0 && (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger variant={'secondary'} className="w-[220px]">
                  <SelectValue
                    placeholder="Select Account"
                    className={cn(buttonVariants({ variant: 'secondary' }))}
                  />
                </SelectTrigger>
                <SelectContent className="dark">
                  {accountUids.map((accountId) => (
                    <SelectItem key={accountId} value={accountId}>
                      {accountEmailMap[accountId]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div>
          <div className="space-y-4">
            {/* Master toggle for category splitting */}
            {/* Individual category toggles - only show when category splitting is enabled */}

            <div className="space-y-0.5">
              <h4 className="font-medium text-foreground">
                {t('settings.display.inbox.category.title')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('settings.display.inbox.category.enable_splitting_description')}
              </p>
            </div>
            <div className="space-y-4">
              {categorySettings.map((category) => (
                <FormField
                  key={category.name}
                  control={form.control}
                  name={category.name as keyof InboxCategoryFormValues}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-sm text-foreground">{category.title}</h4>
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          size={'sm'}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>
        </div>
        <Button type="submit" disabled={!isModified}>
          {t('settings.buttons.save_changes')}
        </Button>
      </form>
    </Form>
  );
}
