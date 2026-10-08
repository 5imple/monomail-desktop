import { useAuth } from '@/renderer/app/context/AuthContext';
import { useLabelAtom } from '@/renderer/app/store/label/useLabelAtom';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Connected accounts that need attention, each with a short reason.
 *
 * Label loading and the Gmail-scope check are Gmail-specific, so Microsoft
 * accounts (Graph scopes, no Gmail labels yet) are only flagged when their
 * sign-in has genuinely expired.
 */
export function useAccountErrors() {
  const { accounts } = useAuth();
  const { labelsMapByAccount } = useLabelAtom();
  const { t } = useTranslation();

  return useMemo(() => {
    const hasLabelsLoaded = Object.keys(labelsMapByAccount).length > 0;

    return accounts.flatMap((account) => {
      const isGoogle = account.provider === 'google';
      const hasLabelError = isGoogle && hasLabelsLoaded && !labelsMapByAccount[account.uid];
      const missingGmailScope =
        isGoogle && !account.scopes.some((scope) => scope.includes('https://mail.google.com'));

      if (!hasLabelError && !account.isExpired && !missingGmailScope) return [];

      const reason = account.isExpired
        ? t('tooltips.account_status.authentication_expired')
        : hasLabelError
          ? t('tooltips.account_status.too_many_requests')
          : missingGmailScope
            ? t('tooltips.account_status.missing_gmail_permissions')
            : t('tooltips.account_status.requires_reconnecting');

      return [{ account, reason }];
    });
  }, [accounts, labelsMapByAccount, t]);
}
