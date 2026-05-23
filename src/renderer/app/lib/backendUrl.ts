/**
 * Resolve the on-prem backend origin. Used for endpoints that used to live
 * on backend-adjacent surfaces (token refresh, account linking, etc.). Prefers MONO_ENV_BACKEND_URL
 * and falls back to MONO_ENV_API_URL — most deployments will host both
 * surfaces behind the same origin.
 *
 * Returns an origin without trailing slash, e.g. "https://api.example.com".
 */
export function backendUrl(): string {
  const explicit = (import.meta.env.MONO_ENV_BACKEND_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const apiBase = (import.meta.env.MONO_ENV_API_URL || '').trim();
  return apiBase.replace(/\/$/, '');
}
