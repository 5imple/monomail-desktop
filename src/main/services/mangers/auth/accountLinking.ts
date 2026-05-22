import { net } from 'electron';

import { resolveBackendUrl, tokenManager } from '@/main/services/mangers/auth/TokenManager';

interface AccountLinkTokenResponse {
  accessToken?: unknown;
  token?: unknown;
  refreshToken?: unknown;
  refresh_token?: unknown;
  expiresIn?: unknown;
  expires_in?: unknown;
}

export type AccountLinkCompletionResult =
  | { ok: true; accessToken: string; expiresAt: number }
  | { ok: false; error: string; status?: number };

function isPlausibleAccessToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 32 &&
    value.length <= 8192 &&
    value.split('.').length === 3
  );
}

function isPlausibleRefreshToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 8192;
}

function isPlausibleExchangeValue(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 512;
}

function parseJsonSafely(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function tokenError(body: AccountLinkTokenResponse): string | null {
  const accessToken = body.accessToken ?? body.token;
  const refreshToken = body.refreshToken ?? body.refresh_token;
  if (!isPlausibleAccessToken(accessToken)) {
    return 'Account-link completion response is missing a valid access token';
  }
  if (!isPlausibleRefreshToken(refreshToken)) {
    return 'Account-link completion response is missing a valid refresh token';
  }
  return null;
}

export async function completeAccountLinkWithBackend(args: {
  intent: string;
  code: string;
}): Promise<AccountLinkCompletionResult> {
  const backend = resolveBackendUrl();
  if (!backend) return { ok: false, error: 'MONO_ENV_BACKEND_URL is not configured' };

  const accessToken = tokenManager.getAccessToken();
  if (!accessToken) return { ok: false, error: 'You must be signed in before adding Gmail.' };

  if (!isPlausibleExchangeValue(args.intent)) {
    return { ok: false, error: 'Account-link intent is missing or malformed' };
  }
  if (!isPlausibleExchangeValue(args.code)) {
    return { ok: false, error: 'Account-link completion code is missing or malformed' };
  }

  try {
    const response = await net.fetch(`${backend}/desktop/account-link-completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: args.intent,
        code: args.code
      })
    });

    const raw = await response.text();
    const body = parseJsonSafely(raw) as AccountLinkTokenResponse & { error?: unknown };

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          typeof body.error === 'string'
            ? body.error
            : `Account-link completion failed (${response.status})`
      };
    }

    const error = tokenError(body);
    if (error) return { ok: false, error };

    const completedAccessToken = (body.accessToken ?? body.token) as string;
    const refreshToken = (body.refreshToken ?? body.refresh_token) as string;
    const expiresInRaw = body.expiresIn ?? body.expires_in;
    const expiresInSec =
      typeof expiresInRaw === 'number' && Number.isFinite(expiresInRaw) && expiresInRaw > 0
        ? expiresInRaw
        : 3600;

    tokenManager.saveTokens({
      accessToken: completedAccessToken,
      refreshToken,
      expiresInSec
    });

    return {
      ok: true,
      accessToken: completedAccessToken,
      expiresAt: tokenManager.getState()?.expiresAt ?? Date.now() + expiresInSec * 1000
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Account-link completion failed'
    };
  }
}
