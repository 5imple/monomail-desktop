import authApi from '@/main/api/auth/authApi';
import { UserPreference } from '@/main/api/auth/types';
import { Badge } from '@/renderer/app/components/ui/badge';
import { Button } from '@/renderer/app/components/ui/button';
import { Form, FormControl, FormField, FormItem } from '@/renderer/app/components/ui/form';
import { Switch } from '@/renderer/app/components/ui/switch';
import { SettingsPageHeader } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

// Zod schema for thread list display preferences
const threadListFormSchema = z.object({
  showAvatar: z.boolean().default(false),
  showSnippet: z.boolean().default(true),
  showLabels: z.boolean().default(true),
  showAttachments: z.boolean().default(true)
});

type ThreadListFormValues = z.infer<typeof threadListFormSchema>;

export function ThreadListDisplayForm() {
  const { preference, updatePreference } = useAuth();
  const { t } = useTranslation();

  // Local copy of preference so we can reflect fresh updates immediately
  const [localPreference, setLocalPreference] = useState(preference);

  const threadListForm = useForm<ThreadListFormValues>({
    resolver: zodResolver(threadListFormSchema),
    defaultValues: {
      showAvatar: preference.display.threadList?.showAvatar ?? false,
      showSnippet: preference.display.threadList?.showSnippet ?? true,
      showLabels: preference.display.threadList?.showLabels ?? true,
      showAttachments: preference.display.threadList?.showAttachments ?? true
    }
  });

  // Reset thread list form when preferences change
  useEffect(() => {
    const threadListPrefs = localPreference.display.threadList ?? {
      showAvatar: preference.display.threadList?.showAvatar ?? false,
      showSnippet: preference.display.threadList?.showSnippet ?? true,
      showLabels: preference.display.threadList?.showLabels ?? true,
      showAttachments: preference.display.threadList?.showAttachments ?? true
    };

    threadListForm.reset({
      showAvatar: threadListPrefs.showAvatar,
      showSnippet: threadListPrefs.showSnippet,
      showLabels: threadListPrefs.showLabels,
      showAttachments: threadListPrefs.showAttachments
    });
  }, [localPreference, threadListForm, preference]);

  async function onThreadListSubmit(data: ThreadListFormValues) {
    try {
      // Build updated thread list preference
      const updatedThreadListPrefs = {
        ...localPreference.display.threadList,
        ...data
      };

      // Build full updated preference object
      const updatedPreference: UserPreference = {
        ...localPreference,
        display: {
          ...localPreference.display,
          threadList: updatedThreadListPrefs
        }
      };

      // Persist to server
      await authApi.updateUserPreference({
        display: {
          inbox: localPreference.display.inbox,
          threadList: updatedThreadListPrefs
        }
      });

      setLocalPreference(updatedPreference);

      // Update global preference state
      if (updatePreference) {
        updatePreference({
          display: {
            inbox: localPreference.display.inbox,
            threadList: updatedThreadListPrefs
          }
        });
      }

      toast.success(t('toast.preferences.updated'));
    } catch (error) {
      console.error('Error updating thread list display preferences:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  // Watch thread list form values
  const watchShowAvatar = threadListForm.watch('showAvatar');
  const watchShowSnippet = threadListForm.watch('showSnippet');
  const watchShowLabels = threadListForm.watch('showLabels');
  const watchShowAttachments = threadListForm.watch('showAttachments');

  // Determine if thread list settings have been modified
  const isThreadListModified = useMemo(() => {
    const currentThreadListPrefs = localPreference.display.threadList ?? {
      showAvatar: preference.display.threadList?.showAvatar ?? false,
      showSnippet: preference.display.threadList?.showSnippet ?? true,
      showLabels: preference.display.threadList?.showLabels ?? true,
      showAttachments: preference.display.threadList?.showAttachments ?? true
    };

    return (
      watchShowAvatar !== currentThreadListPrefs.showAvatar ||
      watchShowSnippet !== currentThreadListPrefs.showSnippet ||
      watchShowLabels !== currentThreadListPrefs.showLabels ||
      watchShowAttachments !== currentThreadListPrefs.showAttachments
    );
  }, [
    watchShowAvatar,
    watchShowSnippet,
    watchShowLabels,
    watchShowAttachments,
    localPreference,
    preference
  ]);

  // Thread list display settings for easy rendering
  const threadListSettings = [
    {
      name: 'showAvatar',
      title: t('settings.display.threadlist.show_avatar'),
      description: t('settings.display.threadlist.show_avatar_description')
    },
    {
      name: 'showSnippet',
      title: t('settings.display.threadlist.show_snippet'),
      description: t('settings.display.threadlist.show_snippet_description')
    },
    {
      name: 'showLabels',
      title: t('settings.display.threadlist.show_labels'),
      description: t('settings.display.threadlist.show_labels_description')
    },
    {
      name: 'showAttachments',
      title: t('settings.display.threadlist.show_attachments'),
      description: t('settings.display.threadlist.show_attachments_description')
    }
  ];

  return (
    <Form {...threadListForm}>
      <form onSubmit={threadListForm.handleSubmit(onThreadListSubmit)} className="space-y-8">
        <SettingsPageHeader
          title={t('settings.display.threadlist.title')}
          description={t('settings.display.threadlist.description')}
        />

        <div className="space-y-4">
          <div className="space-y-0.5">
            <h4 className="font-medium text-foreground">
              {t('settings.display.threadlist.display_options')}
              <Badge sizeVariant={'xs'} className="ml-2 rounded-sm">
                New
              </Badge>
            </h4>
            <p className="text-sm text-muted-foreground">
              {t('settings.display.threadlist.display_options_description')}
            </p>
          </div>

          <div className="space-y-4">
            {threadListSettings.map((setting) => (
              <FormField
                key={setting.name}
                control={threadListForm.control}
                name={setting.name as keyof ThreadListFormValues}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-sm text-foreground">{setting.title}</h4>
                      <p className="text-sm text-muted-foreground">{setting.description}</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} size={'sm'} />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}
          </div>
        </div>

        <Button type="submit" disabled={!isThreadListModified}>
          {t('settings.buttons.save_changes')}
        </Button>
      </form>
    </Form>
  );
}
