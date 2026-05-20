import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/renderer/app/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel
} from '@/renderer/app/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/renderer/app/components/ui/select';
import { BillingBanner } from '@/renderer/app/components/ui/billing-banner';
import { BillingSwitch } from '@/renderer/app/components/ui/billing-switch';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useAutopilotSettings } from '@/renderer/app/store/ai/useAutopilotSettings';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';

type AutoPilotFormValues = {
  enableAutoPilot: boolean;
};

export function AutoPilotForm() {
  const { accounts } = useAuth();
  const { loadAutopilotSettings, isLoading, updateAllSettingsForAccount, autopilotSettings } =
    useAutopilotSettings();
  const { hasProAccess } = useBillingAtom();

  const { t } = useTranslation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0].uid ?? '');

  const accountUids = useMemo(() => accounts.map((account) => account.uid), [accounts]);

  const accountEmailMap = useMemo(() => {
    const emailMap: Record<string, string> = {};
    accounts.forEach((account) => {
      emailMap[account.uid] = account?.email || account.uid;
    });
    return emailMap;
  }, [accounts]);

  useEffect(() => {
    if (accountUids.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accountUids[0]);
    }
  }, [accountUids, selectedAccountId]);

  const currentAccountSettings = useMemo(() => {
    if (!selectedAccountId) return null;
    return autopilotSettings[selectedAccountId];
  }, [selectedAccountId, autopilotSettings]);

  const form = useForm<AutoPilotFormValues>({
    defaultValues: {
      enableAutoPilot:
        accountUids.length > 0 && autopilotSettings[accountUids[0]]
          ? autopilotSettings[accountUids[0]].enableAutoPilot
          : false
    }
  });

  useEffect(() => {
    if (!currentAccountSettings) {
      form.reset({
        enableAutoPilot: false
      });
      return;
    }

    form.reset({
      enableAutoPilot: currentAccountSettings.enableAutoPilot || false
    });
  }, [currentAccountSettings, form]);

  const watchAutoPilot = form.watch('enableAutoPilot');

  const isAutoPilotModified = useMemo(
    () => watchAutoPilot !== (currentAccountSettings?.enableAutoPilot || false),
    [watchAutoPilot, currentAccountSettings?.enableAutoPilot]
  );

  async function onSubmit(data: AutoPilotFormValues) {
    if (!selectedAccountId) return;

    try {
      if (isAutoPilotModified) {
        const updatedSettings = {
          enableAutoPilot: data.enableAutoPilot
        };

        await updateAllSettingsForAccount(selectedAccountId, updatedSettings);
        toast.success(t('toast.preferences.updated'));
      }
    } catch (error) {
      console.error('Error updating AI settings:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  return (
    <Form {...form}>
      <BillingBanner type="pro" />
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-8">
          <SettingsPageHeader
            title={t('settings.ai.autopilot.title')}
            description={t('settings.ai.autopilot.description')}
            action={
              accountUids.length > 0 ? (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger variant="secondary">
                    <SelectValue placeholder="Select Account" />
                  </SelectTrigger>
                  <SelectContent className="dark">
                    {accountUids.map((accountId) => (
                      <SelectItem key={accountId} value={accountId}>
                        {accountEmailMap[accountId]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined
            }
          />

          {!selectedAccountId ? (
            <div className="space-y-6 text-center">
              <span className="mt-10 text-sm text-muted-foreground">Please select an account</span>
            </div>
          ) : (
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="enableAutoPilot"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2 text-sm text-foreground">
                        {t('settings.ai.autopilot.enable')}
                        {isAutoPilotModified && <div className="h-2 w-2 rounded-full bg-accent" />}
                      </FormLabel>
                      <FormDescription>
                        {t('settings.ai.autopilot.enable_description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <BillingSwitch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={!isAutoPilotModified || isLoading || !selectedAccountId || !hasProAccess}
            tooltip={!hasProAccess ? t('settings.billing.upgrade_required_pro') : undefined}
          >
            {t('settings.buttons.save_changes')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default AutoPilotForm;
