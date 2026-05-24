import { tokenManager } from '@/main/services/mangers/auth/TokenManager';
import { ipcMain, net } from 'electron';
import log from 'electron-log';

type GmailRequestArgs = {
  method?: string;
  path?: string;
  uid?: string;
  headers?: Record<string, string>;
  body?: string;
  responseType?: 'json' | 'blob' | 'text';
};

type GmailRequestResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status?: number; data?: unknown; error: string };

const GMAIL_BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PEOPLE_BASE_URL = 'https://people.googleapis.com/v1';
const CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const FORWARDED_HEADERS = new Set(['accept', 'content-type']);

function buildGmailUrl(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (/[\r\n]/.test(path)) return null;
  return `${GMAIL_BASE_URL}${path}`;
}

function buildPeopleUrl(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (/[\r\n]/.test(path)) return null;
  return `${PEOPLE_BASE_URL}${path}`;
}

function buildCalendarUrl(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (/[\r\n]/.test(path)) return null;
  return `${CALENDAR_BASE_URL}${path}`;
}

function sanitizeMethod(method: unknown): string | null {
  if (typeof method !== 'string') return null;
  const normalized = method.toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : null;
}

function sanitizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object') return {};

  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).flatMap(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (!FORWARDED_HEADERS.has(normalizedKey) || typeof value !== 'string') return [];
      return [[key, value]];
    })
  );
}

async function readResponseBody(
  response: Response,
  responseType: GmailRequestArgs['responseType']
): Promise<unknown> {
  if (response.status === 204) return {};

  if (responseType === 'blob') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      base64: buffer.toString('base64'),
      type: response.headers.get('content-type') ?? ''
    };
  }

  if (responseType === 'text') {
    return response.text();
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function getErrorMessage(status: number, data: unknown, service = 'Gmail'): string {
  if (data && typeof data === 'object') {
    const maybeError = (data as { error?: unknown }).error;
    if (typeof maybeError === 'string') return maybeError;
    if (maybeError && typeof maybeError === 'object') {
      const message = (maybeError as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }

  return `${service} request failed (${status})`;
}

export function registerGmailHandlers() {
  ipcMain.handle('main:gmail:request', async (_event, args?: GmailRequestArgs) => {
    try {
      const url = buildGmailUrl(args?.path);
      if (!url)
        return { ok: false, error: 'Invalid Gmail request path' } satisfies GmailRequestResult;

      const method = sanitizeMethod(args?.method);
      if (!method) {
        return { ok: false, error: 'Invalid Gmail request method' } satisfies GmailRequestResult;
      }

      const uid = typeof args?.uid === 'string' && args.uid.trim() ? args.uid.trim() : null;
      if (!uid)
        return { ok: false, error: 'Gmail account uid is required' } satisfies GmailRequestResult;

      const { accessToken } = await tokenManager.getGoogleAccountAccessToken(uid);
      const headers = {
        ...sanitizeHeaders(args?.headers),
        Authorization: `Bearer ${accessToken}`
      };

      const response = await net.fetch(url, {
        method,
        headers,
        body: typeof args?.body === 'string' ? args.body : undefined
      });

      const data = await readResponseBody(response, args?.responseType ?? 'json');
      if (!response.ok) {
        log.warn(`[gmail:ipc] request failed: ${method} ${response.status}`);
        return {
          ok: false,
          status: response.status,
          data,
          error: getErrorMessage(response.status, data, 'Gmail')
        } satisfies GmailRequestResult;
      }

      return { ok: true, status: response.status, data } satisfies GmailRequestResult;
    } catch (error) {
      log.error('[gmail:ipc] request failed:', error instanceof Error ? error.message : error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Gmail request failed'
      } satisfies GmailRequestResult;
    }
  });

  ipcMain.handle('main:people:request', async (_event, args?: GmailRequestArgs) => {
    try {
      const url = buildPeopleUrl(args?.path);
      if (!url)
        return { ok: false, error: 'Invalid People request path' } satisfies GmailRequestResult;

      const uid = typeof args?.uid === 'string' && args.uid.trim() ? args.uid.trim() : null;
      if (!uid)
        return { ok: false, error: 'People account uid is required' } satisfies GmailRequestResult;

      const { accessToken } = await tokenManager.getGoogleAccountAccessToken(uid);
      const response = await net.fetch(url, {
        method: 'GET',
        headers: {
          ...sanitizeHeaders(args?.headers),
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });

      const data = await readResponseBody(response, args?.responseType ?? 'json');
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data,
          error: getErrorMessage(response.status, data, 'People')
        } satisfies GmailRequestResult;
      }

      return { ok: true, status: response.status, data } satisfies GmailRequestResult;
    } catch (error) {
      log.error('[people:ipc] request failed:', error instanceof Error ? error.message : error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'People request failed'
      } satisfies GmailRequestResult;
    }
  });

  ipcMain.handle('main:calendar:request', async (_event, args?: GmailRequestArgs) => {
    try {
      const url = buildCalendarUrl(args?.path);
      if (!url)
        return { ok: false, error: 'Invalid Calendar request path' } satisfies GmailRequestResult;

      const method = sanitizeMethod(args?.method);
      if (!method) {
        return { ok: false, error: 'Invalid Calendar request method' } satisfies GmailRequestResult;
      }

      const uid = typeof args?.uid === 'string' && args.uid.trim() ? args.uid.trim() : null;
      if (!uid) {
        return {
          ok: false,
          error: 'Calendar account uid is required'
        } satisfies GmailRequestResult;
      }

      const { accessToken } = await tokenManager.getGoogleAccountAccessToken(uid);
      const headers = {
        Accept: 'application/json',
        ...sanitizeHeaders(args?.headers),
        Authorization: `Bearer ${accessToken}`
      };

      const response = await net.fetch(url, {
        method,
        headers,
        body: typeof args?.body === 'string' ? args.body : undefined
      });

      const data = await readResponseBody(response, args?.responseType ?? 'json');
      if (!response.ok) {
        log.warn(`[calendar:ipc] request failed: ${method} ${response.status}`);
        return {
          ok: false,
          status: response.status,
          data,
          error: getErrorMessage(response.status, data, 'Calendar')
        } satisfies GmailRequestResult;
      }

      return { ok: true, status: response.status, data } satisfies GmailRequestResult;
    } catch (error) {
      log.error('[calendar:ipc] request failed:', error instanceof Error ? error.message : error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Calendar request failed'
      } satisfies GmailRequestResult;
    }
  });
}
