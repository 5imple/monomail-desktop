import { net, shell } from 'electron';
import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import log from 'electron-log';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_PEOPLE_ME_PHOTOS_URL =
  'https://people.googleapis.com/v1/people/me?personFields=photos';
const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');
const FLOW_TIMEOUT_MS = 5 * 60_000;

export interface GoogleOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function fetchUserInfo(
  accessToken: string
): Promise<{ sub: string; email: string; name?: string; picture?: string }> {
  const res = await net.fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`userinfo fetch failed: ${res.status}`);
  return res.json() as Promise<{ sub: string; email: string; name?: string; picture?: string }>;
}

// The OIDC `picture` claim is frequently absent for Google Workspace accounts.
// Fall back to the People API so the user's own avatar still resolves. Returns
// only a real (non-default) photo; if the account has no photo (Google serves an
// auto-generated monogram flagged `default`), this yields undefined so the UI
// shows its initials fallback instead of Google's generic glyph.
async function fetchOwnPhotoUrl(accessToken: string): Promise<string | undefined> {
  try {
    const res = await net.fetch(GOOGLE_PEOPLE_ME_PHOTOS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { photos?: { url?: string; default?: boolean }[] };
    return data.photos?.find((photo) => photo?.url && !photo.default)?.url;
  } catch {
    return undefined;
  }
}

class GoogleOAuthServer {
  private static instance: GoogleOAuthServer;
  private flowInProgress = false;

  static getInstance(): GoogleOAuthServer {
    if (!GoogleOAuthServer.instance) {
      GoogleOAuthServer.instance = new GoogleOAuthServer();
    }
    return GoogleOAuthServer.instance;
  }

  isConfigured(): boolean {
    return !!(import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim();
  }

  async startFlow(options: { prompt?: string } = {}): Promise<GoogleOAuthTokens> {
    if (this.flowInProgress) {
      throw new Error('An OAuth flow is already in progress. Check your browser.');
    }
    const clientId = (import.meta.env.MONO_ENV_GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (import.meta.env.MONO_ENV_GOOGLE_CLIENT_SECRET || '').trim();
    if (!clientId) throw new Error('MONO_ENV_GOOGLE_CLIENT_ID is not configured.');

    this.flowInProgress = true;
    try {
      return await this._runFlow(clientId, clientSecret, options.prompt ?? 'consent');
    } finally {
      this.flowInProgress = false;
    }
  }

  private _runFlow(
    clientId: string,
    clientSecret: string,
    prompt: string
  ): Promise<GoogleOAuthTokens> {
    return new Promise((resolve, reject) => {
      const { verifier, challenge } = generatePkce();
      let settled = false;
      let port = 0;
      let server: ReturnType<typeof createServer> | null = null;
      let timeout: NodeJS.Timeout;

      const finish = (err: Error | null, tokens?: GoogleOAuthTokens) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        server?.close();
        if (err) {
          log.warn('[GoogleOAuthServer] flow failed:', err.message);
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

          const code = reqUrl.searchParams.get('code');
          if (!code) {
            res.writeHead(400);
            res.end();
            finish(new Error('No authorization code in OAuth callback'));
            return;
          }

          const params = new URLSearchParams({
            client_id: clientId,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: `http://127.0.0.1:${port}/callback`
          });
          if (clientSecret) params.set('client_secret', clientSecret);

          const tokenRes = await net.fetch(GOOGLE_TOKEN_URL, {
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
          };

          if (!body.access_token) throw new Error('Token response missing access_token');
          if (!body.refresh_token) {
            throw new Error(
              'Token response missing refresh_token — ensure offline_access was requested'
            );
          }

          const userInfo = await fetchUserInfo(body.access_token);
          // Workspace accounts often omit the OIDC `picture`; fall back to People API.
          const picture = userInfo.picture || (await fetchOwnPhotoUrl(body.access_token));

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
            sub: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
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
          scope: GMAIL_SCOPES,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          access_type: 'offline',
          prompt
        });

        const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`;
        log.info('[GoogleOAuthServer] opening browser for OAuth consent');
        shell.openExternal(authUrl).catch((e: Error) => finish(e));
      });

      timeout = setTimeout(() => {
        finish(new Error('OAuth flow timed out — no response from Google within 5 minutes'));
      }, FLOW_TIMEOUT_MS);
    });
  }
}

export const googleOAuthServer = GoogleOAuthServer.getInstance();
