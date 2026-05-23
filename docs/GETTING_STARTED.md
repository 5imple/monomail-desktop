# Getting started (local run)

This app is an **Electron** desktop client that can run in two modes:

- **Standalone Google mode** — connects directly to Gmail via your own Google Cloud OAuth credentials. No backend server needed. See [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) to create credentials.
- **On-prem backend mode** — connects to a self-hosted backend. See [ON_PREM_BACKEND_CONTRACT.md](ON_PREM_BACKEND_CONTRACT.md) for the API surface the backend must expose.

---

## Prerequisites

- **Node.js 18 LTS** or newer.
- **npm** (comes with Node).

---

## 1. Install dependencies

```bash
git clone <repo-url>
cd monomail-desktop
npm install
```

---

## 2. Environment variables

The build uses the prefix **`MONO_ENV_`** for all app variables (see `electron.vite.config.ts`). Variables are **baked in at build time** — changing `.env.development` requires restarting `npm run dev`.

```bash
cp .env.example .env.development
```

### Standalone Google mode (recommended for local dev)

Set only these two variables:

```dotenv
MONO_ENV_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
MONO_ENV_GOOGLE_CLIENT_SECRET=<your-client-secret>   # optional
```

Leave all other vars blank. See [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) for how to create these credentials.

### On-prem backend mode

```dotenv
MONO_ENV_API_URL=https://api.example.com      # base URL, no trailing slash, no /api/v1
MONO_ENV_BACKEND_URL=https://api.example.com  # usually the same as API_URL
MONO_ENV_HOMEPAGE_DOMAIN=https://app.example.com
MONO_ENV_PROTOCOL=mono-desktop                # deep-link scheme for OAuth callbacks
MONO_ENV_APP_VERSION=1.0.0-dev
MONO_ENV_SUPPORT_EMAIL=support@example.com
```

See [ON_PREM_BACKEND_CONTRACT.md](ON_PREM_BACKEND_CONTRACT.md) for the full backend API contract.

### Local development with mock backend

```dotenv
MONO_ENV_HOMEPAGE_DOMAIN=http://localhost:3030
MONO_ENV_API_URL=http://localhost:3030
MONO_ENV_BACKEND_URL=http://localhost:3030
```

Then run `npm run mock-backend` in a separate terminal.

### Other optional variables

| Variable | Default | Purpose |
|---|---|---|
| `MONO_ENV_APP_VERSION` | — | Version string; values containing `dev` enable dev-only UI. |
| `MONO_ENV_SUPPORT_EMAIL` | `support@example.com` | Support address in UI copy. |
| `MONO_ENV_COOKIE_DOMAIN` | derived from HOMEPAGE | Cookie `domain=` for link-share flows. |
| `MONO_ENV_UTM_SOURCE` | `app` | UTM source for marketing links. |
| `MONO_ENV_CAREERS_URL` | — | If set, shown in dev console banner. |
| `MONO_ENV_BRAND_EMAIL_DOMAIN` | — | Email domain that triggers custom favicon routing. |
| `MONO_ENV_SOCIAL_X_URL` | — | "Follow on X" URL; hidden if empty. |
| `MONO_ENV_DISCORD_INVITE_URL` | — | Discord invite URL; hidden if empty. |
| `MONO_ENV_PUBLIC_DOMAIN` | — | Public domain for share links. |
| `MONO_ENV_UPDATE_FEED_URL` | — | Auto-updater feed URL for packaged builds. |
| `MONO_ENV_PUSH_WS_PATH` | `/push/ws` | WebSocket path on the backend for push frames. |
| `MONO_ENV_MIXPANEL_TOKEN` | — | Mixpanel project token for analytics. |

> `.env*` files except `.env.example` are gitignored. Never commit secrets.

---

## 3. Run in development

```bash
npm run dev
```

---

## 4. Production build (optional)

```bash
npm run build
```

Platform packaging uses **electron-builder**. macOS signing and notarization require Apple credentials. Update `publish` / `dev-app-update.yml` with your own update server URLs before shipping.

---

## 5. Common problems

| Symptom | What to check |
|---|---|
| Sign-in button does nothing | `MONO_ENV_GOOGLE_CLIENT_ID` must be set and `npm run dev` restarted after editing `.env.development`. |
| "Access blocked" or OAuth error | Confirm client ID matches your Google Cloud project and your email is a test user (see [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)). |
| `Backend not configured` in console | Expected in standalone Google mode — backend errors are non-fatal and can be ignored. |
| `npm install` errors | Use Node 18+; delete `node_modules` and retry only as a last resort. |
| Blank UI after clone | Missing env vars; check the terminal where `npm run dev` runs for build errors. |
