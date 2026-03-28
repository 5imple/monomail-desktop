import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import authApi from '@/main/api/auth/authApi';
import { SupportedLanguage } from '@/main/api/auth/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/app/components/ui/avatar';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/renderer/app/components/ui/form';
import { Input } from '@/renderer/app/components/ui/input';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const languages = [
  { label: 'English', value: 'en' },
  { label: 'Español', value: 'es' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' }
] as const;

const profileFormSchema = z.object({
  displayName: z
    .string()
    .min(2, {
      message: 'Username must be at least 2 characters.'
    })
    .max(30, {
      message: 'Username must not be longer than 30 characters.'
    }),
  language: z.string({
    required_error: 'Please select a language.'
  }),
  primary_email: z
    .string({
      required_error: 'Please select an email to display.'
    })
    .email()
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm() {
  const { member, accounts, preference, signIn, updatePreference, signOut } = useAuth();
  const { openDialog, closeDialog } = useDialogs();

  const [appVersion, setAppVersion] = useState(import.meta.env.MONO_ENV_APP_VERSION);
  const { i18n, t } = useTranslation();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: member?.displayName ?? undefined,
      primary_email: member?.email,
      language: preference.language
    },
    mode: 'onChange'
  });

  async function onSubmit(data: ProfileFormValues) {
    if (!member) return;
    try {
      await authApi.updateUserProfile({
        language: data.language as SupportedLanguage,
        displayName: data.displayName
      });
      await updatePreference({
        language: data.language as SupportedLanguage
      });
      await i18n.changeLanguage(data.language);
      if (data.primary_email != member.email) {
        const account = accounts.find((account) => account.email === data.primary_email);
        if (account) {
          const response = await authApi.updatePrimaryAccount(account.uid);
          if (response && response.token) signIn(response.token);
        }
      }
      toast.success(t('toast.preferences.updated'));
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(t('toast.error.preference_update'));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="flex items-center gap-3">
          <div className="group relative flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-16 w-16 rounded-full">
                  <AvatarImage src={member?.profileImageUrl ?? undefined} />
                  <AvatarFallback>{member?.displayName![0] ?? 'E'}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              {/* <TooltipContent side={'bottom'} className="dark">
                Change photo
              </TooltipContent> */}
            </Tooltip>
            {/* <Button
              className="absolute -right-1 -top-1 hidden items-center justify-center rounded-full group-hover:flex"
              type="button"
              variant={'outline'}
              typeVariant={'icon'}
              sizeVariant={'xs'}
            >
              <MonoIcon type={'X'} className="h-3 w-3" />
            </Button> */}
          </div>
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>@{member?.memberName}</FormLabel>
                <FormControl>
                  <Input placeholder={t('settings.profile.your_name')} {...field} />
                </FormControl>
                {/* <FormDescription>
                This is your public display name. It can be your real name or a pseudonym. You can
                only change this once every 30 days.
              </FormDescription> */}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="primary_email"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="inline-flex items-center gap-2">
                {t('settings.profile.primary_account.title')}
                <Tooltip>
                  <TooltipTrigger type={'button'}>
                    <MonoIcon type={'HelpCircle'} className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side={'right'}>
                    {t('settings.profile.primary_account.tooltip')}
                  </TooltipContent>
                </Tooltip>
              </FormLabel>
              <FormControl>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="w-[200px] justify-between">
                      {field.value
                        ? accounts.find((account) => account.email === field.value)?.email
                        : ''}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[200px]">
                    <DropdownMenuGroup>
                      {accounts.map((account) => (
                        <DropdownMenuCheckboxItem
                          key={account.email}
                          checked={field.value === account.email}
                          onClick={() => form.setValue('primary_email', account.email)}
                        >
                          {account.email}
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
        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{t('settings.profile.language')}</FormLabel>
              <FormControl>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" className="w-[200px] justify-between">
                      {field.value
                        ? languages.find((language) => language.value === field.value)?.label
                        : 'Select language'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[200px]">
                    <DropdownMenuGroup>
                      {languages.map((language) => (
                        <DropdownMenuCheckboxItem
                          key={language.value}
                          checked={field.value === language.value}
                          onClick={() => form.setValue('language', language.value)}
                        >
                          {language.label}
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

        <Button type="submit">{t('settings.buttons.save_changes')}</Button>
        <Separator />
        <div className="">
          <div className="text-sm text-muted-foreground">
            {t('settings.profile.delete_account.description')}
          </div>
          <Button
            type={'button'}
            variant={'secondary'}
            onClick={() => openDialog('deleteAccount')}
            className="mt-3 text-destructive hover:text-destructive"
          >
            {t('settings.profile.delete_account.button')}
          </Button>
        </div>

        <Separator />
        <div className="flex justify-end gap-3 text-end">
          <a
            className="text-xs text-muted-foreground"
            href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/terms`}
            target="_blank"
            rel="noreferrer"
          >
            {t('settings.footer.terms')}
          </a>
          <a
            className="text-xs text-muted-foreground"
            href={`${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/policy`}
            target="_blank"
            rel="noreferrer"
          >
            {t('settings.footer.privacy')}
          </a>
          <span className="text-xs text-muted-foreground">{appVersion}</span>
        </div>
      </form>
    </Form>
  );
}
