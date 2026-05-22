import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import authApi from '@/main/api/auth/authApi';
import { MonoAccount } from '@/main/api/auth/types';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AccountList from '@/renderer/app/components/ui/account-list';
import { Button } from '@/renderer/app/components/ui/button';
import { Form } from '@/renderer/app/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/renderer/app/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { startEmailAccountLink } from '@/renderer/app/lib/accountLinking';

const IntegrationFormSchema = z.object({
  accounts: z
    .array(
      z.object({
        displayName: z.string(),
        email: z.string(),
        profileImageUrl: z.string()
      })
    )
    .optional()
});

type IntegrationFormValues = z.infer<typeof IntegrationFormSchema>;

export function IntegrationForm() {
  const { member, accounts, updateAccounts } = useAuth();
  const { t } = useTranslation();
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(IntegrationFormSchema),
    defaultValues: {
      accounts: accounts
    }
  });

  const { fields, append, replace } = useFieldArray({
    name: 'accounts',
    control: form.control
  });

  useEffect(() => {
    if (accounts && accounts.length > 0) {
      replace(accounts);
    }
  }, [accounts, replace]);

  function onSubmit(data: IntegrationFormValues) {
    toast(
      <div>
        <div>You submitted the following values:</div>
        <pre className="mt-2 w-full rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      </div>
    );
  }

  const handleDisconnectAccount = async (account: MonoAccount) => {
    if (!member) return;
    try {
      const primaryAccount = accounts.find((account) => account.uid === member.primaryUid);
      if (primaryAccount) {
        // TODO update space
        await authApi.unlinkAccountFromUser(account.uid);
        await updateAccounts();
        toast.success(`Disconnected ${account.email}`);
      }
    } catch (e) {
      toast.error(t('toast.error.unlink_account'));
    }
  };

  const getAccountStatusTooltip = useCallback(
    (account: MonoAccount) => {
      if (account.isExpired) {
        return t('tooltips.account_status.authentication_expired');
      }

      if (!account.scopes.some((scope) => scope.includes('https://mail.google.com'))) {
        return t('tooltips.account_status.missing_gmail_permissions');
      }

      return t('tooltips.account_status.requires_reconnecting');
    },
    [t]
  );

  const shouldShowReconnectButton = useCallback((account: MonoAccount) => {
    return (
      account.isExpired ||
      !account.scopes.some((scope) => scope.includes('https://mail.google.com'))
    );
  }, []);

  const handleAddAccount = useCallback(async () => {
    setIsAddingAccount(true);
    try {
      await startEmailAccountLink('gmail');
    } finally {
      setIsAddingAccount(false);
    }
  }, []);

  if (!member) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div>
          <div className="overflow-hidden rounded-md border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead colSpan={2} className="bg-muted">
                    {t('settings.integration.title')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length > 0 ? (
                  accounts
                    .sort((a) => (a.uid === member?.primaryUid ? -1 : 1))
                    .map((account) => (
                      <TableRow key={account.email}>
                        <TableCell className="h-12 p-4">
                          <div className="flex items-center gap-2">
                            <AccountList accounts={[account]} />
                            {shouldShowReconnectButton(account) && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <MonoIcon type={'AlertCircle'} className="text-destructive" />
                                </TooltipTrigger>
                                <TooltipPortal>
                                  <TooltipContent side="right">
                                    {getAccountStatusTooltip(account)}
                                  </TooltipContent>
                                </TooltipPortal>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="h-12 text-end">
                          {member.primaryUid === account.uid ? (
                            <div className="text-muted-foreground">
                              {t('settings.integration.primary_account')}
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              {shouldShowReconnectButton(account) && (
                                <Button
                                  sizeVariant="sm"
                                  type={'button'}
                                  variant={'secondary'}
                                  disabled={isAddingAccount}
                                  onClick={() => {
                                    void handleAddAccount();
                                  }}
                                >
                                  {t('settings.integration.reconnect')}
                                  <MonoIcon type={'ExternalLink'} className="ml-2 h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                onClick={() => {
                                  handleDisconnectAccount(account);
                                }}
                                sizeVariant="sm"
                                type={'button'}
                                className="text-destructive"
                                variant={'secondary'}
                              >
                                {t('settings.integration.disconnect')}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow key={'no_account'}>
                    <TableCell className="text-muted-foreground">
                      {t('settings.integration.no_accounts')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            disabled={isAddingAccount}
            onClick={() => {
              void handleAddAccount();
            }}
          >
            {t('settings.integration.add_account')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
