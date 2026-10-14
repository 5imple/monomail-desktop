/** Values from env — no product-specific defaults in source. */

export function getSupportEmail(): string {
  return import.meta.env.MONO_ENV_SUPPORT_EMAIL?.trim() || 'support@example.com';
}
