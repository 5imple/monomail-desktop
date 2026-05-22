# Getting started (local run)

This app is an **Electron** desktop client. It needs **Node.js** and a filled-in environment file before `npm run dev` will work.

## Prerequisites

- **Node.js 18 LTS** or newer (same major version as CI is a safe choice).
- **npm** (comes with Node).

Optional but useful:

- A **Firebase** project (Authentication, and related products you enable in code) if you use real sign-in.
- A **backend API** compatible with what the app expects (`MONO_ENV_API_URL`), or your own fork of the server.

## 1. Install dependencies

```bash
git clone https://github.com/erickim20/monomail-desktop.git
cd monomail-desktop
npm install
```

## 2. Environment variables

The build uses the prefix **`MONO_ENV_`** for Vite/Electron (see `electron.vite.config.ts`).

1. Copy the example file:

   ```bash
   cp .env.example .env.development
   ```

2. Edit **`.env.development`** and replace every `VALUE` with real settings for your Firebase project, API, and domains.

   - **`MONO_ENV_API_URL`** — **Required.** Base URL of your API **without** a trailing slash and **without** `/api/v1` (that path is appended in code). Example: `https://api.example.com`
   - **`MONO_ENV_HOMEPAGE_DOMAIN`** — Your marketing / web origin (e.g. `https://app.example.com`) used for links and some client-side URLs.
   - **`MONO_ENV_PROTOCOL`** — Custom URL scheme for deep links (e.g. `myapp`). Must match what you configure for OAuth / redirects.
   - **`MONO_ENV_APP_VERSION`** — Any string the app can read; many places treat versions containing `dev` as non-production (e.g. `1.0.0-dev`).
   - **Firebase fields** — From the Firebase console (Web app config), plus **`MONO_ENV_FIREBASE_VAPID_KEY`** if you use web push / FCM in the way this project expects.
   - **`MONO_ENV_MIXPANEL_TOKEN`** — Can be a placeholder if you are not using Mixpanel locally, unless the build fails without it (then use a test project token).
   - **`MONO_ENV_SUPPORT_EMAIL`** — Support address for UI defaults, mailto links, and notification copy (falls back to `support@example.com` if unset).
   - **`MONO_ENV_COOKIE_DOMAIN`** — Optional. For link-share flows, cookie `domain=` (e.g. `.example.com`). If empty, a value is derived from `MONO_ENV_HOMEPAGE_DOMAIN`.
   - **`MONO_ENV_UTM_SOURCE`** — Optional marketing UTM `utm_source` (default `app`).
   - **`MONO_ENV_CAREERS_URL`** — Optional; if set, printed in the dev console banner.
   - **`MONO_ENV_BRAND_EMAIL_DOMAIN`** — Optional; if an address contains this substring, favicon loading uses your homepage API route (like the built-in cases for gmail.com, etc.).
   - **`MONO_ENV_SOCIAL_X_URL`** — Optional full URL for “Follow on X”; if empty, those menu entries are hidden.
   - **`MONO_ENV_DISCORD_INVITE_URL`** — Optional Discord invite URL; if empty, those entries are hidden.

**Note:** `.env*` files except `.env.example` are gitignored. Never commit secrets.

## 3. Run in development

```bash
npm run dev
```

This runs **electron-vite** in development mode and loads **`.env.development`** (Vite convention for `development` mode).

## 4. Production-like build (optional)

```bash
npm run build
```

Platform-specific packaging uses **electron-builder**; signing and notarization on macOS require Apple credentials in your environment (see Electron Builder docs). Update **`publish`** / **`dev-app-update.yml`** URLs for your own update server if you ship binaries.

## 5. Common problems

| Symptom                            | What to check                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Error about **`MONO_ENV_API_URL`** | Ensure `.env.development` exists in the repo root and the variable is set (no quotes needed unless your shell requires them).              |
| Firebase / auth failures           | Confirm all `MONO_ENV_FIREBASE_*` values match one Firebase project and that Authentication (and any OAuth providers) are enabled.         |
| `npm install` errors               | Use Node 18+; on corporate networks try again or configure npm proxy; delete `node_modules` and `package-lock.json` only as a last resort. |
| Blank or broken UI after clone     | Often missing or wrong env; check the terminal where `electron-vite` runs for build errors.                                                |

## 6. Backend and licensing

This repository is the **desktop client** only. Running the full product still requires a compatible **API** and (for some features) cloud functions or third-party analytics accounts. Forks should replace placeholder domains, Firebase project IDs in **`.firebaserc`**, and updater URLs with their own infrastructure.
