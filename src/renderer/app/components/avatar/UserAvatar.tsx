import { FC } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/app/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';

import { MonoMember } from '@/main/api/auth/types';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { getDiscordInviteUrl, getSocialXUrl } from '@/renderer/app/lib/runtimeBranding';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { cn } from '@/renderer/app/lib/utils';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/renderer/app/components/ui/skeleton';
import { useSyncHistory } from '@/renderer/app/context/SyncHistoryContext';
import { useSyncThread } from '@/renderer/app/context/SyncThreadContext';
interface UserAvatarProps {
  user: MonoMember | null;
  className?: string;
}

const UserAvatar: FC<UserAvatarProps> = ({ user, className }) => {
  const { signOut, accounts } = useAuth();
  const { exitWorker: exitHistoryWorker } = useSyncHistory();
  const { exitWorker: exitThreadWorker } = useSyncThread();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await exitThreadWorker();
    await exitHistoryWorker();
    await signOut();
    return navigate('/', { replace: true });
  };

  const { t } = useTranslation();

  const { openDialog } = useDialogs();
  return user ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="rounded-full transition-colors duration-300 hover:bg-muted">
          <Avatar className={cn('cursor-pointer rounded-full border', className)}>
            <AvatarImage
              className="select-none bg-gradient-to-t from-muted-low to-secondary object-contain transition-opacity duration-300 dark:from-background dark:to-secondary"
              alt={`@${user.displayName}`}
              src={user.profileImageUrl}
            />
            <AvatarFallback className="select-none bg-gradient-to-t from-muted-low to-secondary object-contain text-sm transition-opacity duration-300 dark:from-background dark:to-secondary">
              {user?.displayName![0].toUpperCase() ?? 'E'}
            </AvatarFallback>
          </Avatar>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="mr-2 w-60">
        <DropdownMenuLabel className="text-sm font-normal">
          <div className="text-foreground">{user.displayName}</div>
          <div className="text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {getSocialXUrl() ? (
            <DropdownMenuItem asChild>
              <a href={getSocialXUrl()} target="_blank" rel="noreferrer">
                {t('sidebar.follow_us_x')}
              </a>
            </DropdownMenuItem>
          ) : null}
          {getDiscordInviteUrl() ? (
            <DropdownMenuItem asChild>
              <a href={getDiscordInviteUrl()} target="_blank" rel="noreferrer">
                {t('sidebar.join_discord')}
              </a>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              openDialog('preference', { defaultPage: 'general' });
            }}
          >
            {/* <MonoIcon type={'Cog'} className="mr-2 h-4 w-4" /> */}
            <span>{t('sidebar.open_preferences')}</span>
            <DropdownMenuShortcut>
              <ShortcutKeyboard variant={'flat'} shortcut={'MOD+COMMA'} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              openDialog('preference', { defaultPage: 'shortcut' });
            }}
          >
            {/* <MonoIcon type={'Keyboard'} className="mr-2 h-4 w-4" /> */}
            <span>{t('sidebar.keyboard_shortcut')}</span>
            <DropdownMenuShortcut>
              <ShortcutKeyboard variant={'flat'} shortcut={'?'} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            openDialog('preference', { defaultPage: 'integration' });
          }}
          className="w-full rounded-md p-2 text-sm text-muted-foreground transition-colors duration-100 hover:bg-muted"
        >
          {/* <MonoIcon type={'Logout'} className="mr-2 h-4 w-4" /> */}
          {t('account_switcher.add_another_account')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleLogout}
          className="w-full rounded-md p-2 text-sm text-muted-foreground transition-colors duration-100 hover:bg-muted"
        >
          {/* <MonoIcon type={'Logout'} className="mr-2 h-4 w-4" /> */}
          {t('account_switcher.log_out')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <Skeleton className="h-8 w-8 rounded-full" />
  );
};

export default UserAvatar;
