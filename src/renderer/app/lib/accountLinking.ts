import electronApi, { isElectron } from '@/renderer/app/lib/electronApi';
import { toast } from 'sonner';

type ProviderId = 'gmail' | string;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function getHomepageBase(): string | null {
  const raw = (import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  return trimTrailingSlash(raw);
}

function isLocalDevBase(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAddAccountParams(html: string): URLSearchParams | null {
  const protocol = import.meta.env.MONO_ENV_PROTOCOL || 'mono-desktop';
  const match = html.match(new RegExp(`${escapeRegExp(protocol)}://addAccount\\?([^"'\\s<>]+)`));
  if (!match) return null;
  return new URLSearchParams(match[1]);
}

async function completeLocalDevAddAccount(linkUrl: string): Promise<boolean> {
  try {
    const res = await fetch(linkUrl);
    if (!res.ok) {
      toast.error(`Gmail connection failed: local mock returned ${res.status}.`);
      return false;
    }

    const params = extractAddAccountParams(await res.text());
    if (!params) {
      toast.error('Gmail connection failed: local mock did not return an add-account link.');
      return false;
    }

    const intent = params.get('intent');
    const code = params.get('code') ?? params.get('completion_code');
    if (intent && code) {
      const result = await electronApi.completeAccountLink({ intent, code });
      if (!result.ok) {
        toast.error(`Gmail connection failed: ${result.error}`);
        return false;
      }
      return true;
    }

    const accessToken = params.get('token');
    const refreshToken = params.get('refresh_token');
    const expiresInRaw = params.get('expires_in');
    if (!accessToken || !refreshToken) {
      toast.error('Gmail connection failed: add-account link was missing tokens.');
      return false;
    }

    const result = await electronApi.devAddAccount({
      accessToken,
      refreshToken,
      expiresInSec: expiresInRaw ? Number(expiresInRaw) : undefined
    });
    if (!result.ok) {
      toast.error(`Gmail connection failed: ${result.error}`);
      return false;
    }

    return true;
  } catch (error) {
    toast.error(
      `Gmail connection failed: ${error instanceof Error ? error.message : 'local mock error'}`
    );
    return false;
  }
}

export async function startEmailAccountLink(provider: ProviderId = 'gmail'): Promise<boolean> {
  // Primary path: PKCE direct Google OAuth when client ID is configured.
  if (isElectron && (import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim()) {
    const result = await electronApi.initiateAddAccount();
    if (!result.ok) {
      toast.error(`Gmail connection failed: ${result.error}`);
      return false;
    }
    return true;
  }

  // Dev / legacy path: use MONO_ENV_HOMEPAGE_DOMAIN + backend intents.
  const baseUrl = getHomepageBase();
  if (!baseUrl) {
    toast.error('Gmail connection is unavailable: set MONO_ENV_GOOGLE_CLIENT_ID or MONO_ENV_HOMEPAGE_DOMAIN.');
    return false;
  }

  const client = isElectron ? 'web-electron' : 'web';
  const linkUrl = new URL(`${baseUrl}/add-account`);
  linkUrl.searchParams.set('client', client);
  linkUrl.searchParams.set('provider', provider);

  if (isElectron) {
    const intent = await electronApi.createAccountLinkIntent({ provider, client });
    if (!intent.ok) {
      toast.error(`Gmail connection is unavailable: ${intent.error}`);
      return false;
    }
    linkUrl.searchParams.set('intent', intent.intent);

    if (isLocalDevBase(baseUrl)) {
      window.open(linkUrl.toString(), '_blank', 'noopener,noreferrer');
      return completeLocalDevAddAccount(linkUrl.toString());
    }
  }

  window.open(linkUrl.toString(), '_blank', 'noopener,noreferrer');
  toast('Continue in your browser to connect Gmail.');
  return true;
}
