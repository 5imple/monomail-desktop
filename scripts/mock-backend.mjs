#!/usr/bin/env node
/**
 * Local mock backend for monomail-desktop Phase B end-to-end testing.
 *
 * Implements the minimum surface defined in docs/ON_PREM_BACKEND_CONTRACT.md
 * so the desktop client can complete sign-in, refresh tokens, receive
 * pushes, and load past the login screen — without waiting on the real
 * backend team.
 *
 * Usage:
 *   node scripts/mock-backend.mjs              # listens on http://localhost:3030
 *   MOCK_BACKEND_PORT=8080 node scripts/mock-backend.mjs
 *
 * Then in .env (rebuild required — electron-vite bakes env at build time):
 *   MONO_ENV_HOMEPAGE_DOMAIN=http://localhost:3030
 *   MONO_ENV_API_URL=http://localhost:3030
 *   MONO_ENV_BACKEND_URL=http://localhost:3030
 *   MONO_ENV_PUBLIC_DOMAIN=http://localhost:3030
 */

import { createHmac, randomBytes } from 'crypto';
import { createServer } from 'http';
import { URL } from 'url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.MOCK_BACKEND_PORT || 3030);
const DEEPLINK_PROTOCOL = process.env.MOCK_DEEPLINK_PROTOCOL || 'mono-desktop';
const TOKEN_TTL_SEC = Number(process.env.MOCK_TOKEN_TTL_SEC || 3600);
const PUSH_INTERVAL_MS = Number(process.env.MOCK_PUSH_INTERVAL_MS || 30_000);

// HMAC-signed JWT-shaped tokens. Not real JWT — just `header.payload.sig`
// so the client's basic shape validator accepts them. Keep the secret
// stable for the process lifetime so refresh tokens validate.
const SECRET = randomBytes(32).toString('hex');

const STUB_MEMBER = {
  uid: 'mock-member-1',
  displayName: 'Mock User',
  email: 'mock.user@example.com',
  primaryUid: 'mock-account-primary',
  memberName: 'mock.user',
  profileImageUrl: '',
  timezone: 'America/Los_Angeles',
  demographics: { role: '', emailUsage: '', discoverySource: '' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const STUB_ACCOUNTS = [
  {
    uid: 'mock-account-primary',
    displayName: 'Mock User',
    provider: 'google',
    email: 'mock.user@example.com',
    profileImageUrl: '',
    primary: true,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    isExpired: false
  }
];

const STUB_PREFERENCE = {
  language: 'en',
  appearance: { theme: 'system', density: 'cozy' },
  compose: { cancelWindow: 5, fullscreen: false },
  account: { accentColor: {} },
  signature: { includeInReplies: true, includeInForwards: true, includeInNewMessages: true },
  display: { inbox: { category: {} }, threadList: {} },
  notifications: {}
};

// ---------- token helpers ---------------------------------------------------

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(createHmac('sha256', SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function issueTokens() {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = sign({
    sub: STUB_MEMBER.uid,
    email: STUB_MEMBER.email,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
    type: 'access'
  });
  const refreshToken = sign({
    sub: STUB_MEMBER.uid,
    iat: now,
    exp: now + 86400 * 30,
    type: 'refresh',
    jti: randomBytes(8).toString('hex')
  });
  return { accessToken, refreshToken, expiresIn: TOKEN_TTL_SEC };
}

// ---------- request helpers -------------------------------------------------

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && body !== null && !(body instanceof Buffer);
  const payload = isJson ? JSON.stringify(body) : body || '';
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    ...headers
  });
  res.end(payload);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ---------- HTTP routes -----------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method?.toUpperCase() ?? 'GET';

  if (method === 'OPTIONS') return send(res, 204, '');

  console.log(`[mock] ${method} ${path}${url.search}`);

  // --- Sign-in page ---
  if (method === 'GET' && path === '/sign-in') {
    const tokens = issueTokens();
    const deeplink = `${DEEPLINK_PROTOCOL}://signIn?token=${encodeURIComponent(
      tokens.accessToken
    )}&refresh_token=${encodeURIComponent(tokens.refreshToken)}&expires_in=${tokens.expiresIn}`;
    return send(
      res,
      200,
      `<!doctype html>
<html>
<head>
  <title>Mock Sign In</title>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 80px auto; padding: 24px; }
    h1 { font-size: 22px; letter-spacing: -0.01em; }
    p { color: #666; line-height: 1.5; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .btn { display: inline-block; padding: 10px 18px; background: #dc2626; color: #fff; border: none; border-radius: 6px; text-decoration: none; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #b91c1c; }
    .small { font-size: 12px; color: #999; margin-top: 32px; }
  </style>
</head>
<body>
  <h1>Mock backend sign-in</h1>
  <p>This is the local <code>mock-backend</code> standing in for your on-prem sign-in page. Clicking below issues stub access + refresh tokens and redirects back to the desktop app via <code>${DEEPLINK_PROTOCOL}://</code>.</p>
  <a class="btn" href="${deeplink}">Continue as ${STUB_MEMBER.email}</a>
  <p class="small">Tokens last ${TOKEN_TTL_SEC}s. The client will refresh automatically via <code>POST /auth/refresh</code>.</p>
</body>
</html>`
    );
  }

  // --- Auth refresh ---
  if (method === 'POST' && path === '/auth/refresh') {
    try {
      const body = await readJson(req);
      if (!body.refreshToken || typeof body.refreshToken !== 'string') {
        return send(res, 400, { error: 'refreshToken required' });
      }
      // Mock backend doesn't validate the signature — any non-empty string
      // refreshes successfully. Real backend should verify HMAC + jti.
      return send(res, 200, issueTokens());
    } catch (e) {
      return send(res, 400, { error: 'bad json' });
    }
  }

  // --- NPS (ported Cloud Function) ---
  if (method === 'GET' && path === '/nps/entries') {
    return send(res, 200, { entries: [], totalCount: 0 });
  }
  if (method === 'POST' && path === '/nps') {
    const body = await readJson(req).catch(() => ({}));
    const entry = {
      id: randomBytes(6).toString('hex'),
      score: body.score ?? 0,
      comment: body.comment ?? '',
      userEmail: STUB_MEMBER.email,
      eventType: body.eventType ?? 'general_feedback',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: STUB_MEMBER.uid
    };
    return send(res, 200, entry);
  }

  // --- Billing (ported Cloud Function) ---
  if (method === 'GET' && path === '/payment/payment-info') {
    // Return 404 so the client treats this as "no active subscription".
    return send(res, 404, { error: 'no subscription' });
  }

  // --- Share resolver (placeholder) ---
  if (method === 'GET' && path.startsWith('/share/')) {
    return send(res, 200, '<html><body><h1>Mock share view</h1><p>This would resolve a share token to the actual content in the real backend.</p></body></html>');
  }

  // --- Mono REST API (mounted under /api/v1) ---
  if (path.startsWith('/api/v1/')) {
    const apiPath = path.slice('/api/v1'.length);

    if (method === 'GET' && apiPath === '/mono/user/info') {
      return send(res, 200, {
        member: STUB_MEMBER,
        accounts: STUB_ACCOUNTS,
        relatedMembers: []
      });
    }
    if (method === 'POST' && apiPath === '/mono/user/create') {
      return send(res, 200, {
        member: STUB_MEMBER,
        accounts: STUB_ACCOUNTS,
        relatedMembers: []
      });
    }
    if (method === 'GET' && apiPath === '/mono/preference') {
      return send(res, 200, STUB_PREFERENCE);
    }
    if (method === 'PATCH' && apiPath === '/mono/preference') {
      const body = await readJson(req).catch(() => ({}));
      return send(res, 200, { ...STUB_PREFERENCE, ...(body.preference ?? {}) });
    }

    // Empty-collection responses so the inbox can render past sign-in.
    if (method === 'GET' && apiPath.startsWith('/mail/threads')) {
      return send(res, 200, { threads: [], nextPageToken: null, resultSizeEstimate: 0 });
    }
    if (method === 'GET' && apiPath === '/mail/drafts') {
      return send(res, 200, { drafts: [], nextPageToken: null });
    }
    if (method === 'GET' && apiPath.startsWith('/label')) {
      return send(res, 200, { labels: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/space')) {
      return send(res, 200, { spaces: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/mono/contact')) {
      return send(res, 200, { contacts: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/mono/pin')) {
      return send(res, 200, { pinnedEmails: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/bookmark')) {
      return send(res, 200, { bookmarks: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/signature')) {
      return send(res, 200, { signatures: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/template')) {
      return send(res, 200, { templates: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/tracking')) {
      return send(res, 200, { events: [] });
    }
    if (method === 'GET' && apiPath.startsWith('/ai-filter')) {
      return send(res, 200, { filters: [] });
    }
    if (method === 'POST' && apiPath === '/gmail/watch') {
      return send(res, 200, { historyId: '0', expiration: String(Date.now() + 86400_000) });
    }
    if (method === 'POST' && apiPath.startsWith('/gmail/stop')) {
      return send(res, 200, {});
    }

    // Everything else: pretend it's fine but log loudly so we know what
    // else the client wants.
    console.warn(`[mock] unstubbed ${method} ${path} → returning empty 200`);
    return send(res, 200, {});
  }

  return send(res, 404, { error: 'not found', path });
});

// ---------- WebSocket push --------------------------------------------------

const wss = new WebSocketServer({ server, path: '/push/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');
  if (!token) {
    console.log('[push] rejecting connection — no token');
    ws.close(4401, 'missing token');
    return;
  }
  console.log(`[push] client connected (token=${token.slice(0, 16)}…)`);

  // Send a welcome control frame (no `data` → client treats as control,
  // doesn't forward to renderer).
  ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));

  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    // Periodic test push — a fake "new message" event so you can watch
    // the renderer side react.
    const frame = {
      data: {
        type: 'MESSAGE_ADDED',
        aAUid: STUB_ACCOUNTS[0].uid,
        threadId: `mock-thread-${randomBytes(4).toString('hex')}`,
        id: `mock-msg-${randomBytes(4).toString('hex')}`,
        labels: '[INBOX, UNREAD]',
        verification: 'false',
        link: '',
        code: ''
      },
      notification: {
        title: 'Mock Sender <noreply@example.com>',
        body: 'This is a mock push to verify the WebSocket → renderer path.'
      }
    };
    try {
      ws.send(JSON.stringify(frame));
      console.log('[push] sent test MESSAGE_ADDED frame');
    } catch (e) {
      console.warn('[push] send failed:', e.message);
    }
  }, PUSH_INTERVAL_MS);

  ws.on('close', (code, reason) => {
    clearInterval(interval);
    console.log(`[push] client closed code=${code} reason=${reason?.toString() || ''}`);
  });
  ws.on('error', (err) => console.warn('[push] error:', err.message));
});

// ---------- Boot ------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\nMock backend listening on http://localhost:${PORT}`);
  console.log(`  Sign-in page:   http://localhost:${PORT}/sign-in`);
  console.log(`  Refresh:        POST http://localhost:${PORT}/auth/refresh`);
  console.log(`  Push WS:        ws://localhost:${PORT}/push/ws?token=…`);
  console.log(`  API base:       http://localhost:${PORT}/api/v1/…`);
  console.log('\nSet your .env to point at this host:');
  console.log('  MONO_ENV_HOMEPAGE_DOMAIN=http://localhost:' + PORT);
  console.log('  MONO_ENV_API_URL=http://localhost:' + PORT);
  console.log('  MONO_ENV_BACKEND_URL=http://localhost:' + PORT);
  console.log('  MONO_ENV_PUBLIC_DOMAIN=http://localhost:' + PORT);
  console.log('\nElectron-vite bakes env at build time — rebuild after editing .env.\n');
});
