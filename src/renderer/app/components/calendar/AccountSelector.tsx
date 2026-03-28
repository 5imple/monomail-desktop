import React from 'react';
import { MonoAccount, UserPreference } from '@/main/api/auth/types/user';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/renderer/app/components/ui/dropdown-menu';
import MonoIcon from '@/renderer/app/components/icons/icons';
import { cn } from '@/renderer/app/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/renderer/app/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

export interface AccountSelectorProps {
  accounts: MonoAccount[];
  selectedAccountUids: string[];
  onSelectionChange: (selectedUids: string[]) => void;
  preference: UserPreference;
  className?: string;
}

const AccountSelector: React.FC<AccountSelectorProps> = ({
  accounts,
  selectedAccountUids,
  onSelectionChange,
  preference,
  className
}) => {
  const { t } = useTranslation();

  // Check if account has calendar scopes
  const hasCalendarScopes = (account: MonoAccount): boolean => {
    return account.scopes.some(
      (scope) =>
        scope.includes('https://www.googleapis.com/auth/calendar') ||
        scope.includes('https://www.googleapis.com/auth/calendar.events') ||
        scope.includes('https://www.googleapis.com/auth/calendar.readonly')
    );
  };

  // Get tooltip message for account without calendar scopes
  const getScopeTooltip = (account: MonoAccount): string => {
    if (account.isExpired) {
      return t('tooltips.account_status.authentication_expired');
    }
    if (!hasCalendarScopes(account)) {
      return t('tooltips.account_status.missing_calendar_permissions');
    }
    return '';
  };

  const handleAccountToggle = (uid: string, checked: boolean) => {
    if (checked) {
      // Add account to selection
      onSelectionChange([...selectedAccountUids, uid]);
    } else {
      // Remove account from selection, but ensure at least one remains
      const newSelection = selectedAccountUids.filter((id) => id !== uid);
      if (newSelection.length > 0) {
        onSelectionChange(newSelection);
      }
    }
  };

  const getAccountColor = (uid: string): string => {
    return preference.account?.accentColor?.[uid] || '#035ddf'; // Default blue
  };

  // Filter accounts with valid calendar scopes
  const accountsWithCalendarScopes = accounts.filter(hasCalendarScopes);
  const accountsWithoutCalendarScopes = accounts.filter((account) => !hasCalendarScopes(account));

  return (
    <TooltipProvider>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" sizeVariant="sm" className={cn('text-sm', className)}>
            <div className="flex items-center gap-1">
              {selectedAccountUids.length > 3 && (
                <span className="text-muted-foreground">+{selectedAccountUids.length - 3}</span>
              )}
            </div>
            <span>
              {selectedAccountUids.length === accounts.length
                ? 'All accounts'
                : `${selectedAccountUids.length} account${selectedAccountUids.length !== 1 ? 's' : ''}`}
            </span>
            <MonoIcon type="ChevronDown" className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {/* Accounts with calendar scopes */}
          {accountsWithCalendarScopes.map((account) => {
            const isSelected = selectedAccountUids.includes(account.uid);
            const accentColor = getAccountColor(account.uid);
            const isLastSelected = selectedAccountUids.length === 1 && isSelected;

            return (
              <DropdownMenuCheckboxItem
                key={account.uid}
                checked={isSelected}
                onCheckedChange={(checked) => handleAccountToggle(account.uid, checked)}
                disabled={isLastSelected} // Prevent unchecking if it's the last selected
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="text-sm">
                    <span className="text-xs">{account.email}</span>
                  </div>

                  <div
                    className="ml-auto h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                </div>
                {account.primary && (
                  <div className="rounded bg-muted px-1.5 py-0.5 text-xs">Primary</div>
                )}
              </DropdownMenuCheckboxItem>
            );
          })}

          {/* Accounts without calendar scopes */}
          {accountsWithoutCalendarScopes.map((account) => {
            const isSelected = selectedAccountUids.includes(account.uid);
            const accentColor = getAccountColor(account.uid);
            const tooltipMessage = getScopeTooltip(account);

            return (
              <Tooltip key={account.uid}>
                <TooltipTrigger asChild>
                  <div className="relative">
                    <DropdownMenuCheckboxItem
                      checked={isSelected}
                      onCheckedChange={(checked) => handleAccountToggle(account.uid, checked)}
                      disabled={true} // Disable accounts without calendar scopes
                      className="cursor-not-allowed opacity-50"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div className="text-sm">
                          <span className="text-xs">{account.email}</span>
                        </div>

                        <div
                          className="ml-auto h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: accentColor }}
                        />
                      </div>
                      <MonoIcon type="AlertCircle" className="ml-1 h-3 w-3 text-destructive" />
                    </DropdownMenuCheckboxItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <span>{t('calendar.accounts_need_permissions')}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Show message if no accounts have calendar scopes */}
          {accountsWithCalendarScopes.length === 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t('calendar.no_accounts_with_permissions')}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
};

export default AccountSelector;
