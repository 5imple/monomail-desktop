import { MonoAccount } from '@/main/api/auth/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';

import { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface AccountListProps {
  accounts: MonoAccount[];
}

const AccountList: FC<AccountListProps> = ({ accounts }) => {
  const { t } = useTranslation();

  const getAccountIcon = (provider: string) => {
    if (provider === 'google') {
      return <MonoIcon type={'Gmail'} className="mr-2 h-5 w-5" />;
    } else if (provider === 'microsoft') {
      return <MonoIcon type={'Outlook'} className="mr-2 h-5 w-5" />;
    } else {
      return <MonoIcon type={'Mono'} className="mr-2 h-5 w-5" />;
    }
  };

  return accounts.map((account) => {
    return (
      <div key={account.uid} className="flex items-center gap-2">
        <div>{getAccountIcon(account.provider)}</div>
        <div>
          <div className="flex items-center font-semibold">
            {account.displayName}

            {account.isExpired && !account.scopes.includes('https://mail.google.com/') && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <MonoIcon type={'AlertCircle'} className="ml-1 h-4 w-4 text-destructive" />
                </TooltipTrigger>
                <TooltipContent>
                  {t('tooltips.account_status.requires_reconnecting')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div>{account.email}</div>
        </div>
      </div>
    );
  });
};

export default AccountList;
