# Google Cloud Console setup (standalone mode)

This guide walks through setting up Google OAuth credentials for running the app directly against Gmail — no backend server required. Once done, all mail read/write and real-time polling run against Google's APIs using your own project credentials.

## What this enables

- Sign in with any Gmail or Google Workspace account via PKCE OAuth
- Read, send, label, archive, and trash Gmail messages
- Add multiple Gmail accounts to one inbox
- Real-time updates via Gmail history polling (30 s intervals)
- Contacts autocomplete via the People API

## Prerequisites

A Google account with access to [Google Cloud Console](https://console.cloud.google.com).

---

## Step 1 — Create a project

1. Open [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project selector at the top → **New Project**.
3. Name it (e.g. `Mono Mail Desktop`) and click **Create**.
4. Make sure the new project is selected in the selector before continuing.

---

## Step 2 — Enable required APIs

1. In the left sidebar go to **APIs & Services → Library**.
2. Search for and enable each of these:
   - **Gmail API**
   - **People API**

---

## Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (works with any Gmail address; choose **Internal** only for Google Workspace orgs where all users are in your domain).
3. Fill in required fields:
   - **App name**: Mono Mail Desktop (or your branding)
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue**.
5. On the **Scopes** step click **Add or remove scopes** and add:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `openid`, `email`, `profile`
6. Click **Update → Save and Continue**.
7. On the **Test users** step: add any Gmail addresses that will sign in while the app is in *Testing* status. Skip this step if you publish the app.
8. Click **Save and Continue → Back to Dashboard**.

> **Note:** Apps in *Testing* status issue refresh tokens that expire after 7 days. To remove this limit, go back to the consent screen and click **Publish App** (requires completing Google's verification if your scopes include sensitive data).

---

## Step 4 — Create OAuth 2.0 credentials

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Name: anything descriptive (e.g. `Mono Mail Desktop client`).
4. Click **Create**.
5. A dialog shows the **Client ID** and **Client secret**. Copy both.

> Google automatically allows `http://127.0.0.1` loopback redirects for Desktop apps — no manual redirect URI configuration is needed.

---

## Step 5 — Set environment variables

In your `.env.development` file (copy from `.env.example` if it doesn't exist):

```dotenv
MONO_ENV_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
MONO_ENV_GOOGLE_CLIENT_SECRET=<your-client-secret>   # optional but recommended
```

The client secret is not strictly required (PKCE works without it for installed apps), but Google recommends including it for desktop applications.

All other backend-related vars (`MONO_ENV_API_URL`, `MONO_ENV_BACKEND_URL`, `MONO_ENV_HOMEPAGE_DOMAIN`) can be left blank for standalone Google mode.

---

## Step 6 — Run the app

```bash
npm run dev
```

Click **Sign in with Google**. A browser tab opens → complete Google's consent flow → the tab closes and the app is signed in.

---

## Adding more Gmail accounts

After signing in, go to **Settings → Accounts → Add Gmail account**. A new consent flow opens for the second account. Both accounts share one unified inbox.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Access blocked: This app's request is invalid" | Confirm `MONO_ENV_GOOGLE_CLIENT_ID` is set and the app is in your Google Cloud project, not copied from another project. |
| "This app isn't verified" warning | Add yourself as a test user (Step 3) or publish the app. |
| Refresh token expires after 7 days | App is in *Testing* status — publish it (Step 3 note) or re-sign-in when prompted. |
| Contacts don't autocomplete | Check that the People API is enabled and `contacts.readonly` scope was granted during sign-in. |
| `MONO_ENV_GOOGLE_CLIENT_ID is not configured` error | Env vars are baked in at build time — restart `npm run dev` after editing `.env.development`. |
