import { Switch } from '@/renderer/app/components/ui/switch';
import { forwardRef } from 'react';

// Payment-free build — BillingSwitch is a transparent wrapper around the
// base Switch. The `requiresPlan` prop is accepted (for API compat with
// the three settings forms that import it) but no longer gates anything.

interface BillingSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresPlan?: boolean;
  className?: string;
  size?: 'sm';
}

export const BillingSwitch = forwardRef<React.ElementRef<typeof Switch>, BillingSwitchProps>(
  ({ checked, onCheckedChange, disabled = false, className, size, ...props }, ref) => (
    <Switch
      ref={ref}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={className}
      size={size}
      {...props}
    />
  )
);

BillingSwitch.displayName = 'BillingSwitch';
