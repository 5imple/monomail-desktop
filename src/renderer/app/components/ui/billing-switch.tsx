import { Switch } from '@/renderer/app/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/app/components/ui/tooltip';
import { useBillingAtom } from '@/renderer/app/store/account/useBillingAtom';
import { TooltipPortal } from '@radix-ui/react-tooltip';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isDevelopment } from '@/renderer/app/lib/accessManagement';

interface BillingSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresPlan?: boolean;
  className?: string;
  size?: 'sm';
}

export const BillingSwitch = forwardRef<React.ElementRef<typeof Switch>, BillingSwitchProps>(
  (
    { checked, onCheckedChange, disabled = false, requiresPlan = true, className, size, ...props },
    ref
  ) => {
    const { getUserPlan } = useBillingAtom();
    const { t } = useTranslation();

    const hasActivePlan = getUserPlan() === 'pro';
    const isDisabled = disabled || (requiresPlan && !hasActivePlan);
    const showTooltip = requiresPlan && !hasActivePlan;

    const switchElement = (
      <Switch
        ref={ref}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={isDisabled}
        className={className}
        size={size}
        {...props}
      />
    );

    if (showTooltip) {
      return (
        <Tooltip>
          <TooltipTrigger>{switchElement}</TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{t('settings.billing.upgrade_required')}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      );
    }

    return switchElement;
  }
);

BillingSwitch.displayName = 'BillingSwitch';
