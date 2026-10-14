import { MonoAccount } from '@/main/api/auth/types';
import electronApi from '@/renderer/app/lib/electronApi';
import MonoIcon from '@/renderer/app/components/icons/icons';
import AccountList from '@/renderer/app/components/ui/account-list';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle
} from '@/renderer/app/components/ui/alert-dialog';
import { Button } from '@/renderer/app/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/renderer/app/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { useAuth } from '@/renderer/app/context/AuthContext';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { startEmailAccountLink } from '@/renderer/app/lib/accountLinking';

// Nothing on this page is a form: it lists accounts with their actions. (A
// leftover demo form submitted when the status icon was clicked and toasted
// every account's details as raw JSON.)
export function IntegrationForm() {
  const { member, accounts, updateAccounts } = useAuth();
  const { t } = useTranslation();
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  // The account whose Disconnect is being confirmed, and the one being removed.
  const [pendingDisconnect, setPendingDisconnect] = useState<MonoAccount | null>(null);
  const [disconnectingUid, setDisconnectingUid] = useState<string | null>(null);

  // Primary account first, as a copy: sorting the context's array in place
  // reordered it for everyone, with a comparator that ignored its second
  // argument.
  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort(
        (a, b) => Number(b.uid === member?.primaryUid) - Number(a.uid === member?.primaryUid)
      ),
    [accounts, member?.primaryUid]
  );

  const handleDisconnectAccount = async (account: MonoAccount) => {
    if (!member || disconnectingUid) return;
    const primaryAccount = accounts.find((acc) => acc.uid === member.primaryUid);
    if (!primaryAccount) {
      setPendingDisconnect(null);
      return;
    }
    setDisconnectingUid(account.uid);
    try {
      // Remove the Google account from local token storage. renderer:auth:add-account
      // fires from main to trigger updateAccounts, but also call directly to guarantee
      // an immediate UI update.
      const localResult = await electronApi.removeGoogleAccount(account.uid);
      if (!localResult.ok) {
        toast.error(t('toast.error.unlink_account'));
        return;
      }
      await updateAccounts();
      toast.success(
        t('toast.preferences.integration.account_disconnected', { email: account.email })
      );
    } catch (e) {
      toast.error(t('toast.error.unlink_account'));
    } finally {
      setDisconnectingUid(null);
      setPendingDisconnect(null);
    }
  };

  const getAccountStatusTooltip = useCallback(
    (account: MonoAccount) => {
      if (account.isExpired) {
        return t('tooltips.account_status.authentication_expired');
      }

      // The Gmail-scope check only applies to Google accounts; a Microsoft
      // account holds Graph scopes and must not be flagged "missing Gmail
      // permissions".
      if (
        account.provider === 'google' &&
        !account.scopes.some((scope) => scope.includes('https://mail.google.com'))
      ) {
        return t('tooltips.account_status.missing_gmail_permissions');
      }

      return t('tooltips.account_status.requires_reconnecting');
    },
    [t]
  );

  const shouldShowReconnectButton = useCallback((account: MonoAccount) => {
    return (
      account.isExpired ||
      (account.provider === 'google' &&
        !account.scopes.some((scope) => scope.includes('https://mail.google.com')))
    );
  }, []);

  const microsoftConfigured = !!(import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim();

  const handleAddAccount = useCallback(async (provider: 'gmail' | 'microsoft' = 'gmail') => {
    setIsAddingAccount(true);
    try {
      await startEmailAccountLink(provider);
    } finally {
      setIsAddingAccount(false);
    }
  }, []);

  if (!member) return null;

  // While the browser sign-in runs (it can wait up to 5 minutes for an
  // abandoned tab), say so instead of only greying the button out.
  const addAccountLabel = isAddingAccount ? (
    <>
      <MonoIcon type="Loader2" className="mr-2 h-4 w-4 animate-spin" />
      {t('settings.integration.waiting_for_sign_in', 'Waiting for browser sign-in…')}
    </>
  ) : (
    <>
      <MonoIcon type="Plus" className="mr-2" />
      {t('settings.integration.add_account')}
    </>
  );

  return (
    <div className="space-y-8">
      <div>
        {/* No table header: it only repeated the page title. */}
        <div className="overflow-hidden rounded-md border shadow-sm">
          <Table>
            <TableBody>
              {sortedAccounts.length > 0 ? (
                sortedAccounts.map((account) => {
                  const isPrimary = member.primaryUid === account.uid;
                  const needsReconnect = shouldShowReconnectButton(account);
                  return (
                    <TableRow key={account.email}>
                      <TableCell className="h-12 p-4">
                        <AccountList accounts={[account]} />
                      </TableCell>
                      <TableCell className="h-12 text-end">
                        <div className="flex items-center justify-end gap-2">
                          {/* The problem in words, next to its fix (it was a
                              hover-only second alert icon). */}
                          {needsReconnect && (
                            <span className="text-xs text-destructive">
                              {getAccountStatusTooltip(account)}
                            </span>
                          )}
                          {isPrimary && (
                            <span className="text-muted-foreground">
                              {t('settings.integration.primary_account')}
                            </span>
                          )}
                          {/* The primary account can need reconnecting too (it had
                              no way to), and in its own provider's sign-in: a
                              Microsoft 365 account was sent to Google's. */}
                          {needsReconnect && (
                            <Button
                              sizeVariant="sm"
                              type={'button'}
                              variant={'secondary'}
                              disabled={isAddingAccount}
                              onClick={() => {
                                void handleAddAccount(
                                  account.provider === 'microsoft' ? 'microsoft' : 'gmail'
                                );
                              }}
                            >
                              {t('settings.integration.reconnect')}
                              <MonoIcon type={'ExternalLink'} className="ml-2 h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isPrimary && (
                            <Button
                              onClick={() => setPendingDisconnect(account)}
                              sizeVariant="sm"
                              type={'button'}
                              className="text-destructive"
                              variant={'secondary'}
                              disabled={disconnectingUid === account.uid}
                            >
                              {t('settings.integration.disconnect')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
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

        {microsoftConfigured ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" className="mt-2" disabled={isAddingAccount}>
                {addAccountLabel}
                {!isAddingAccount && (
                  <MonoIcon type="ChevronDown" className="ml-2 h-4 w-4 opacity-50" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onSelect={() => {
                  void handleAddAccount('gmail');
                }}
              >
                <MonoIcon type="Gmail" className="mr-2 h-4 w-4" />
                Add Gmail account
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void handleAddAccount('microsoft');
                }}
              >
                <MonoIcon type="Outlook" className="mr-2 h-4 w-4" />
                Add Microsoft 365 account
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            disabled={isAddingAccount}
            onClick={() => {
              void handleAddAccount('gmail');
            }}
          >
            {addAccountLabel}
          </Button>
        )}
        {isAddingAccount && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              'settings.integration.sign_in_hint',
              'Finish signing in in your browser. If you closed it, this resets after 5 minutes.'
            )}
          </p>
        )}
      </div>

      {/* Disconnect used to run on the first click; a double-click then showed
          "Disconnected" followed by an error. */}
      <AlertDialog
        open={!!pendingDisconnect}
        onOpenChange={(open) => {
          if (!open && !disconnectingUid) setPendingDisconnect(null);
        }}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className="dark" />
          <AlertDialogContent
            onEscapeKeyDown={(e) => {
              if (disconnectingUid) e.preventDefault();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">
                {t('settings.integration.disconnect_confirm_title', 'Disconnect {{email}}?', {
                  email: pendingDisconnect?.email ?? ''
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'settings.integration.disconnect_confirm_body',
                  'Its mail stops showing in this app. Nothing is deleted from the mailbox, and you can add the account again any time.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!disconnectingUid}>
                {t('settings.buttons.cancel')}
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={!!disconnectingUid}
                onClick={() => {
                  if (pendingDisconnect) void handleDisconnectAccount(pendingDisconnect);
                }}
              >
                {disconnectingUid && (
                  <MonoIcon type="Loader2" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {t('settings.integration.disconnect')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    </div>
  );
}
