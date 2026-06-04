import { net, shell } from 'electron';
import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import log from 'electron-log';

// Microsoft identity platform (v2) endpoints, templated by tenant.
// Tenant 'organizations' = any work/school tenant (v1 scope: no personal MSA;
// see docs/MICROSOFT_365_SUPPORT_PLAN.md).
const msAuthUrl = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
const msTokenUrl = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const GRAPH_ME_URL =
  'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName';
const GRAPH_ME_PHOTO_URL = 'https://graph.microsoft.com/v1.0/me/photos/96x96/$value';

// Keep in sync with DIRECT_MICROSOFT_SCOPES in TokenManager.ts — mail only
// for v1 (calendar/contacts are explicit non-goals).
const MICROSOFT_SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send'
].join(' ');
const FLOW_TIMEOUT_MS = 5 * 60_000;

export interface MicrosoftOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  /** Stable account uid: microsoft:<tenantId>:<objectId>. */
  uid: string;
  tenantId: string;
  objectId: string;
  userPrincipalName?: string;
  email: string;
  name?: string;
  /** data: URI — Graph photos need an auth header, so a plain URL can't render. */
  picture?: string;
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * Decode the payload of a JWT without signature verification. Safe here ONLY
 * because the id_token arrives directly from login.microsoftonline.com over
 * TLS in the code-exchange response — there is no untrusted hop to tamper
 * with it (standard practice for native public clients).
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('id_token is not a JWT');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

async function fetchGraphProfile(accessToken: string): Promise<{
  id: string;
  displayName?: string;
  mail?: string | null;
  userPrincipalName?: string;
}> {
  const res = await net.fetch(GRAPH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Graph /me fetch failed: ${res.status}`);
  return res.json() as Promise<{
    id: string;
    displayName?: string;
    mail?: string | null;
    userPrincipalName?: string;
  }>;
}

// Graph photos are returned as raw bytes behind auth — convert to a data: URI
// so the renderer's <img> can use it like Google's https photo URLs. 404 is
// normal (no photo set); any failure falls back to the initials avatar.
async function fetchOwnPhotoDataUri(accessToken: string): Promise<string | undefined> {
  try {
    const res = await net.fetch(GRAPH_ME_PHOTO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return undefined;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) return undefined;
    // The data URI lives in the encrypted token store and rides every
    // get-state/accounts-changed IPC — cap it so a misbehaving response can't
    // bloat those paths (a 96x96 JPEG is single-digit KB).
    if (bytes.length > 64 * 1024) return undefined;
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return undefined;
  }
}

class MicrosoftOAuthServer {
  private static instance: MicrosoftOAuthServer;
  private flowInProgress = false;

  static getInstance(): MicrosoftOAuthServer {
    if (!MicrosoftOAuthServer.instance) {
      MicrosoftOAuthServer.instance = new MicrosoftOAuthServer();
    }
    return MicrosoftOAuthServer.instance;
  }

  isConfigured(): boolean {
    return !!(import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim();
  }

  async startFlow(options: { prompt?: string } = {}): Promise<MicrosoftOAuthTokens> {
    if (this.flowInProgress) {
      throw new Error('An OAuth flow is already in progress. Check your browser.');
    }
    const clientId = (import.meta.env.MONO_ENV_MICROSOFT_CLIENT_ID || '').trim();
    const tenant = (import.meta.env.MONO_ENV_MICROSOFT_TENANT || '').trim() || 'organizations';
    if (!clientId) throw new Error('MONO_ENV_MICROSOFT_CLIENT_ID is not configured.');

    this.flowInProgress = true;
    try {
      // select_account (not consent): Microsoft shows the consent screen
      // automatically on first authorization; forcing it every time re-prompts
      // the full grant needlessly.
      return await this._runFlow(clientId, tenant, options.prompt ?? 'select_account');
    } finally {
      this.flowInProgress = false;
    }
  }

  private _runFlow(
    clientId: string,
    tenant: string,
    prompt: string
  ): Promise<MicrosoftOAuthTokens> {
    return new Promise((resolve, reject) => {
      const { verifier, challenge } = generatePkce();
      const expectedState = randomBytes(24).toString('base64url');
      let settled = false;
      let port = 0;
      let server: ReturnType<typeof createServer> | null = null;
      let timeout: NodeJS.Timeout;

      const finish = (err: Error | null, tokens?: MicrosoftOAuthTokens) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        server?.close();
        if (err) {
          log.warn('[MicrosoftOAuthServer] flow failed:', err.message);
          reject(err);
        } else {
          resolve(tokens!);
        }
      };

      server = createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url!, `http://127.0.0.1:${port}`);
          if (reqUrl.pathname !== '/callback') {
            res.writeHead(404);
            res.end();
            return;
          }

          const oauthError = reqUrl.searchParams.get('error');
          if (oauthError) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(
              '<html><body><h2>Sign-in cancelled. You can close this tab and return to Mono Mail.</h2></body></html>'
            );
            finish(
              new Error(
                `OAuth error: ${oauthError} — ${reqUrl.searchParams.get('error_description') ?? ''}`
              )
            );
            return;
          }

          if (reqUrl.searchParams.get('state') !== expectedState) {
            res.writeHead(400);
            res.end();
            finish(new Error('OAuth state mismatch in callback'));
            return;
          }

          const code = reqUrl.searchParams.get('code');
          if (!code) {
            res.writeHead(400);
            res.end();
            finish(new Error('No authorization code in OAuth callback'));
            return;
          }

          // Public client: PKCE only, no client_secret. No `scope` here —
          // RFC 6749 doesn't use it on the code grant (scopes were fixed by
          // the authorization request).
          const params = new URLSearchParams({
            client_id: clientId,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: `http://127.0.0.1:${port}/callback`
          });

          const tokenRes = await net.fetch(msTokenUrl(tenant), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
          });

          if (!tokenRes.ok) {
            const errText = await tokenRes.text();
            throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
          }

          const body = (await tokenRes.json()) as {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
            id_token?: string;
          };

          if (!body.access_token) throw new Error('Token response missing access_token');
          if (!body.refresh_token) {
            throw new Error(
              'Token response missing refresh_token — ensure offline_access was requested'
            );
          }

          // tid/oid come from the id_token (trusted: fetched directly over
          // TLS); Graph /me fills profile fields and the objectId fallback.
          const claims = body.id_token ? decodeJwtPayload(body.id_token) : {};
          const profile = await fetchGraphProfile(body.access_token);
          const tenantId = (claims.tid as string) || '';
          const objectId = (claims.oid as string) || profile.id;
          if (!tenantId || !objectId) {
            throw new Error('Could not resolve tenantId/objectId from sign-in response');
          }
          const email =
            profile.mail ||
            (claims.preferred_username as string) ||
            profile.userPrincipalName ||
            '';
          if (!email) throw new Error('Could not resolve an email address for this account');

          const picture = await fetchOwnPhotoDataUri(body.access_token);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<html><body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:24px">' +
              '<h2>Sign-in complete!</h2><p>You can close this tab and return to Mono Mail.</p>' +
              '</body></html>'
          );

          finish(null, {
            accessToken: body.access_token,
            refreshToken: body.refresh_token,
            expiresInSec: body.expires_in ?? 3600,
            uid: `microsoft:${tenantId}:${objectId}`,
            tenantId,
            objectId,
            userPrincipalName: profile.userPrincipalName,
            email,
            name: profile.displayName || (claims.name as string | undefined),
            picture
          });
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            `<html><body><h2>Sign-in failed.</h2><p>${(e as Error).message}</p><p>Close this tab and try again in Mono Mail.</p></body></html>`
          );
          finish(e as Error);
        }
      });

      server.on('error', (e) => finish(e));

      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address() as { port: number };
        port = addr.port;

        const authParams = new URLSearchParams({
          client_id: clientId,
          redirect_uri: `http://127.0.0.1:${port}/callback`,
          response_type: 'code',
          response_mode: 'query',
          scope: MICROSOFT_SCOPES,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: expectedState,
          prompt
        });

        const authUrl = `${msAuthUrl(tenant)}?${authParams.toString()}`;
        log.info('[MicrosoftOAuthServer] opening browser for OAuth consent');
        shell.openExternal(authUrl).catch((e: Error) => finish(e));
      });

      timeout = setTimeout(() => {
        finish(new Error('OAuth flow timed out — no response from Microsoft within 5 minutes'));
      }, FLOW_TIMEOUT_MS);
    });
  }
}

export const microsoftOAuthServer = MicrosoftOAuthServer.getInstance();
