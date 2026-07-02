import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { toast } from 'sonner';

type ProviderId = 'gmail' | 'outlook' | 'microsoft' | string;

/**
 * Connect an additional Gmail or Microsoft 365 account via direct OAuth (PKCE).
 * Tokens are issued and stored in the main process; the renderer learns about
 * the new account through the `renderer:auth:add-account` IPC event.
 */
export async function startEmailAccountLink(provider: ProviderId = 'gmail'): Promise<boolean> {
  if (provider === 'outlook' || provider === 'microsoft') {
    if (!isElectron || !(import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim()) {
      toast.error('Microsoft connection is unavailable: set MONO_ENV_MICROSOFT_CLIENT_ID and rebuild.');
      return false;
    }

    const result = await electronApi.initiateMicrosoftAddAccount();
    if (!result.ok) {
      toast.error(`Microsoft connection failed: ${result.error}`);
      return false;
    }
    return true;
  }

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
