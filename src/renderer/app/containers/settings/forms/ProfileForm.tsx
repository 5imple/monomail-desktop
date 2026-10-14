import MonoIcon from '@/renderer/app/components/icons/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/app/components/ui/avatar';
import { Separator } from '@/renderer/app/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { SETTINGS_SECTION_TITLE } from '@/renderer/app/containers/settings/SettingsPageHeader';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useTranslation } from 'react-i18next';

// Display name and primary account come from the connected account (Google or
// Microsoft); there is nothing to edit or save here. They're shown as plain
// read-only rows: an always-read-only text field and a disabled menu made the
// page look editable, and broken.
export function ProfileForm() {
  const { member } = useAuth();
  const { t } = useTranslation();
  const appVersion = import.meta.env.MONO_ENV_APP_VERSION;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Avatar className="h-16 w-16 rounded-full">
          <AvatarImage src={member?.profileImageUrl ?? undefined} />
          <AvatarFallback>{member?.displayName?.[0] ?? 'E'}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <div className="text-xs text-muted-foreground">{t('settings.profile.display_name')}</div>
          <p className="truncate text-sm text-foreground">{member?.displayName}</p>
          {member?.memberName && (
            <p className="truncate text-xs text-muted-foreground">@{member.memberName}</p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className={`inline-flex items-center gap-2 ${SETTINGS_SECTION_TITLE}`}>
          {t('settings.profile.primary_account.title')}
          <Tooltip>
            <TooltipTrigger
              type={'button'}
              aria-label={t('settings.profile.primary_account.about', 'About the primary account')}
            >
              <MonoIcon type={'HelpCircle'} className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side={'right'}>
              {t('settings.profile.primary_account.tooltip')}
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm text-foreground">{member?.email}</p>
      </div>

      <p className="text-sm text-muted-foreground">
        {t(
          'settings.profile.synced_note',
          'Your name and photo come from your Google or Microsoft account.'
        )}
      </p>

      <Separator />
      <div className="flex justify-end gap-3 text-end">
        <span className="text-xs text-muted-foreground">
          {t('settings.profile.version', 'Version {{version}}', { version: appVersion })}
        </span>
      </div>
    </div>
  );
}
