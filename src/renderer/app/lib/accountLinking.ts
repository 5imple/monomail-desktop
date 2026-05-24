import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { toast } from 'sonner';

type ProviderId = 'gmail' | string;

/**
 * Connect an additional Gmail account via direct Google OAuth (PKCE). Tokens
 * are issued and stored in the main process; the renderer learns about the new
 * account through the `renderer:auth:add-account` IPC event.
 */
export async function startEmailAccountLink(_provider: ProviderId = 'gmail'): Promise<boolean> {
  if (!isElectron || !(import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim()) {
    toast.error('Gmail connection is unavailable: set MONO_ENV_GOOGLE_CLIENT_ID and rebuild.');
    return false;
  }

  const result = await electronApi.initiateAddAccount();
  if (!result.ok) {
    toast.error(`Gmail connection failed: ${result.error}`);
    return false;
  }
  return true;
}
