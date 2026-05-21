// Payment-free build — BillingBanner is a no-op. Kept as a thin shim so
// the three settings forms that import it don't need editing. Delete
// this file + its consumers in a follow-up if/when billing won't return.

interface BillingBannerProps {
  type: 'pro' | 'plus';
  className?: string;
}

export const BillingBanner = (_props: BillingBannerProps) => null;
