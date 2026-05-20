import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { BillingBanner } from '@/renderer/app/components/ui/billing-banner';
import { BillingSwitch } from '@/renderer/app/components/ui/billing-switch';
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
import { Textarea } from '@/renderer/app/components/ui/textarea';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { ToneSelectionDialog } from '@/renderer/app/containers/dialog/ToneSelectionDialog';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useAutopilotSettings } from '@/renderer/app/store/ai/useAutopilotSettings';

type ToneProfileFormValues = {
  enableVoiceProfiles: boolean;
  voiceProfileContent: string;
};

type MessageCandidate = {
  id: string;
  content: string;
  subject: string;
  timestamp: number;
  score: number;
  truncatedContent?: string;
};

export function ToneProfileForm() {
  const { accounts } = useAuth();
  const { loadAutopilotSettings, isLoading, updateAllSettingsForAccount, autopilotSettings } =
    useAutopilotSettings();
  const { hasProAccess } = useBillingAtom();

  const { t } = useTranslation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0].uid ?? '');
  const [showDialog, setShowDialog] = useState(false);

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

  const form = useForm<ToneProfileFormValues>({
    defaultValues: {
      enableVoiceProfiles:
        accountUids.length > 0 && autopilotSettings[accountUids[0]]
          ? autopilotSettings[accountUids[0]].enableVoiceProfiles
          : false,
      voiceProfileContent:
        accountUids.length > 0 && autopilotSettings[accountUids[0]]
          ? autopilotSettings[accountUids[0]].voiceProfiles?.[0] || ''
          : ''
    }
  });

  useEffect(() => {
    if (!currentAccountSettings) {
      form.reset({
        enableVoiceProfiles: false,
        voiceProfileContent: ''
      });
      return;
    }

    form.reset({
      enableVoiceProfiles: currentAccountSettings.enableVoiceProfiles || false,
      voiceProfileContent: currentAccountSettings.voiceProfiles?.[0] || ''
    });
  }, [currentAccountSettings, form]);

  const watchEnabledVoiceProfiles = form.watch('enableVoiceProfiles');
  const watchVoiceProfileContent = form.watch('voiceProfileContent');

  const isEnabledVoiceProfilesModified = useMemo(
    () => watchEnabledVoiceProfiles !== (currentAccountSettings?.enableVoiceProfiles || false),
    [watchEnabledVoiceProfiles, currentAccountSettings?.enableVoiceProfiles]
  );

  const isVoiceProfileModified = useMemo(
    () => watchVoiceProfileContent !== (currentAccountSettings?.voiceProfiles?.[0] || ''),
    [watchVoiceProfileContent, currentAccountSettings?.voiceProfiles]
  );

  // Function to handle selected messages from dialog
  const handleSelectedMessages = (selectedMessages: MessageCandidate[]) => {
    const combinedContent = selectedMessages.map((msg) => msg.content).join('\n\n---\n\n');
    form.setValue('voiceProfileContent', combinedContent);
  };

  async function onSubmit(data: ToneProfileFormValues) {
    if (!selectedAccountId) return;

    try {
      if (isEnabledVoiceProfilesModified || isVoiceProfileModified) {
        const updatedSettings: {
          enableVoiceProfiles?: boolean;
          voiceProfiles?: string[];
        } = {};

        if (isEnabledVoiceProfilesModified) {
          updatedSettings.enableVoiceProfiles = data.enableVoiceProfiles;
        }

        if (isVoiceProfileModified) {
          updatedSettings.voiceProfiles = data.voiceProfileContent.trim()
            ? [data.voiceProfileContent.trim()]
            : [];
        }

        await updateAllSettingsForAccount(selectedAccountId, updatedSettings);
        toast.success(t('toast.preferences.updated'));
      }
    } catch (error) {
      console.error('Error updating tone profile settings:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  return (
    <Form {...form}>
      <BillingBanner type="pro" />
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-8">
          <SettingsPageHeader
            title={t('settings.ai.voiceprofiles.title')}
            description={t('settings.ai.voiceprofiles.description')}
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
                name="enableVoiceProfiles"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2 text-sm text-foreground">
                        {t('settings.ai.voiceprofiles.save.title')}
                        {isEnabledVoiceProfilesModified && (
                          <div className="h-2 w-2 rounded-full bg-accent" />
                        )}
                      </FormLabel>
                      <FormDescription>
                        {t('settings.ai.voiceprofiles.save.description')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <BillingSwitch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {t('settings.ai.voiceprofiles.content.title')}
                  </span>
                  <div className="flex items-center gap-2">
                    {isVoiceProfileModified && <div className="h-2 w-2 rounded-full bg-accent" />}
                    <Button
                      type="button"
                      variant="secondary"
                      sizeVariant="sm"
                      onClick={() => setShowDialog(true)}
                      disabled={!selectedAccountId || !hasProAccess}
                      tooltip={
                        !hasProAccess ? t('settings.billing.upgrade_required_pro') : undefined
                      }
                    >
                      Get Examples
                    </Button>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="voiceProfileContent"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative">
                          <Textarea
                            {...field}
                            placeholder={t('settings.ai.voiceprofiles.content.placeholder')}
                            className={cn(
                              'h-[300px] resize-none p-4',
                              field.value.length > 900 && 'border-yellow-500',
                              field.value.length >= 1000 && 'border-destructive'
                            )}
                            disabled={
                              !form.watch('enableVoiceProfiles') || isLoading || !hasProAccess
                            }
                            maxLength={1000}
                          />
                          <div className="absolute right-2 top-2 text-xs text-muted-foreground">
                            <span
                              className={cn(
                                field.value.length > 900 && 'text-yellow-500',
                                field.value.length >= 1000 && 'text-destructive'
                              )}
                            >
                              {field.value.length}
                            </span>
                            /1000
                          </div>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={
              (!isEnabledVoiceProfilesModified && !isVoiceProfileModified) ||
              isLoading ||
              !selectedAccountId ||
              !hasProAccess
            }
            tooltip={!hasProAccess ? t('settings.billing.upgrade_required_pro') : undefined}
          >
            {t('settings.buttons.save_changes')}
          </Button>
        </div>
      </form>

      {/* Message Selection Dialog */}
      <ToneSelectionDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onSelectMessages={handleSelectedMessages}
        accountId={selectedAccountId}
      />
    </Form>
  );
}

export default ToneProfileForm;
