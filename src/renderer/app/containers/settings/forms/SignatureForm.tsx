import authApi from '@/main/api/auth/authApi';
import { UserPreference } from '@/main/api/auth/types';
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
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import SignatureTable from './signature/SignatureTable';

// Zod schema for member-wide signature settings
const signatureFormSchema = z.object({
  default_signature: z.boolean().default(true),
  include_in_replies: z.boolean().default(true),
  include_in_forwards: z.boolean().default(true),
  include_in_new_messages: z.boolean().default(true)
});

type SignatureFormValues = z.infer<typeof signatureFormSchema>;

function SignatureForm() {
  const { preference, member, updatePreference } = useAuth();
  const { t } = useTranslation();

  // Add local state to track the current saved preferences
  const [localPreference, setLocalPreference] = useState<UserPreference>(preference);

  const form = useForm<SignatureFormValues>({
    resolver: zodResolver(signatureFormSchema),
    defaultValues: {
      include_in_replies: localPreference.signature?.includeInReplies ?? true,
      include_in_forwards: localPreference.signature?.includeInForwards ?? true,
      include_in_new_messages: localPreference.signature?.includeInNewMessages ?? true
    }
  });

  async function onSubmit(data: SignatureFormValues) {
    if (!member) return;
    try {
      // Update signature preferences on server
      await authApi.updateUserPreference({
        signature: {
          includeInReplies: data.include_in_replies,
          includeInForwards: data.include_in_forwards,
          includeInNewMessages: data.include_in_new_messages
        }
      });

      // Update the local preference state to reflect the new values
      const updatedPreference: UserPreference = {
        ...localPreference,
        signature: {
          ...localPreference.signature,
          includeInReplies: data.include_in_replies,
          includeInForwards: data.include_in_forwards,
          includeInNewMessages: data.include_in_new_messages
        }
      };

      setLocalPreference(updatedPreference);

      // Also update the global preference if updatePreference is available
      if (updatePreference) {
        updatePreference({
          signature: {
            includeInReplies: data.include_in_replies,
            includeInForwards: data.include_in_forwards,
            includeInNewMessages: data.include_in_new_messages
          }
        });
      }

      toast.success(t('toast.preferences.updated'));
    } catch (error) {
      console.error('Error updating signature settings:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  // Watch form values to detect changes
  const watchIncludeInReplies = form.watch('include_in_replies');
  const watchIncludeInForwards = form.watch('include_in_forwards');
  const watchIncludeInNewMessages = form.watch('include_in_new_messages');

  const isIncludeInRepliesModified = useMemo(() => {
    return watchIncludeInReplies !== (localPreference.signature?.includeInReplies ?? true);
  }, [watchIncludeInReplies, localPreference]);

  const isIncludeInForwardsModified = useMemo(() => {
    return watchIncludeInForwards !== (localPreference.signature?.includeInForwards ?? true);
  }, [watchIncludeInForwards, localPreference]);

  const isIncludeInNewMessagesModified = useMemo(() => {
    return watchIncludeInNewMessages !== (localPreference.signature?.includeInNewMessages ?? true);
  }, [watchIncludeInNewMessages, localPreference]);

  // Check if any setting has been modified
  const hasModifications = useMemo(() => {
    return (
      isIncludeInRepliesModified || isIncludeInForwardsModified || isIncludeInNewMessagesModified
    );
  }, [isIncludeInRepliesModified, isIncludeInForwardsModified, isIncludeInNewMessagesModified]);

  return (
    <>
      <SignatureTable />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="space-y-6">
            <div className="pt-6">
              <h4 className="mb-4 font-medium">{t('settings.signature.inclusion_settings')}</h4>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="include_in_new_messages"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-2 text-foreground">
                          {t('settings.signature.include_in_new_messages')}
                          {isIncludeInNewMessagesModified && (
                            <div className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </FormLabel>
                        <FormDescription>
                          {t('settings.signature.include_in_new_messages_description', {
                            defaultValue: 'Add signature to new emails you compose'
                          })}
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
                  name="include_in_replies"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-2 text-foreground">
                          {t('settings.signature.include_in_replies')}
                          {isIncludeInRepliesModified && (
                            <div className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </FormLabel>
                        <FormDescription>
                          {t('settings.signature.include_in_replies_description', {
                            defaultValue: 'Add signature when replying to emails'
                          })}
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
                  name="include_in_forwards"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <FormLabel className="flex items-center gap-2 text-foreground">
                          {t('settings.signature.include_in_forwards')}
                          {isIncludeInForwardsModified && (
                            <div className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </FormLabel>
                        <FormDescription>
                          {t('settings.signature.include_in_forwards_description', {
                            defaultValue: 'Add signature when forwarding emails'
                          })}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={!hasModifications}>
            {t('settings.buttons.save_changes')}
          </Button>
        </form>
      </Form>
    </>
  );
}

export default SignatureForm;
