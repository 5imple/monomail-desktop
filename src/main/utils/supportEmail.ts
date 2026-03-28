export function getSupportEmailMain(): string {
  const fromMeta =
    typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MONO_ENV_SUPPORT_EMAIL;
  const v = (fromMeta || process.env.MONO_ENV_SUPPORT_EMAIL || '').trim();
  return v || 'support@example.com';
}
