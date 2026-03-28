import MonoIcon from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { useDialogs } from '@/renderer/app/store/dialog/useDialogAtom';
import { useTranslation } from 'react-i18next';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';

interface BillingBannerProps {
  type: 'pro' | 'plus';
  className?: string;
}

export const BillingBanner = ({ className, type }: BillingBannerProps) => {
  const { openDialog, closeDialog, dialogState } = useDialogs();
  const { hasProAccess } = useBillingAtom();
  const { t } = useTranslation();

  if (hasProAccess) {
    return null;
  }

  const handleUpgradeClick = () => {
    // If preference dialog is already open, we need to force a refresh to ensure billing tab is selected
    if (dialogState.preference.open) {
      closeDialog('preference');
      // Use setTimeout to ensure the dialog closes before reopening
      setTimeout(() => {
        openDialog('preference', { defaultPage: 'billing' });
      }, 0);
    } else {
      openDialog('preference', { defaultPage: 'billing' });
    }
  };

  return (
    <div
      className={`absolute bottom-4 left-4 right-4 rounded-md border bg-card p-3 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <MonoIcon type="AlertCircle" className="mt-0.5" />
        <div className="flex flex-1 items-center">
          <div className="flex-1">
            <h3 className="text-sm font-medium">
              {type === 'pro'
                ? t('settings.billing.upgrade_required_pro')
                : t('settings.billing.upgrade_required')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('settings.billing.ai_features_locked')}
            </p>
          </div>
          <div className="ml-auto">
            <Button variant="secondary" onClick={handleUpgradeClick}>
              Upgrade Plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
