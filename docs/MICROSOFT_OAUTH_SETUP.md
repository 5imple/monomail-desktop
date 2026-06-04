# Microsoft Entra setup (standalone mode, work/school accounts)

This guide walks through registering an app in Microsoft Entra (Azure AD) so the
desktop client can sign in Microsoft 365 **work/school** accounts directly —
no backend server required. The app is a **public client**: it ships only an
Application (client) ID, never a secret, and authenticates with PKCE through
the system browser.

> Personal accounts (outlook.com / hotmail) are out of scope for v1 — see
> `docs/MICROSOFT_365_SUPPORT_PLAN.md` (Explicit Non-Goals).

## What this enables (current state)

- "Sign in with Microsoft" / add Microsoft 365 accounts (Phase 2 — done)
- Mail read/send for those accounts arrives with the Graph adapter
  (plan Phases 3–8); until then a Microsoft account shows an empty inbox

## Prerequisites

- A Microsoft work/school account that can create app registrations in some
  tenant. No tenant? The free
  [Microsoft 365 Developer Program](https://developer.microsoft.com/microsoft-365/dev-program)
  provides a sandbox tenant — also the right place to test against.

---

## Step 1 — Create the app registration

1. Open [entra.microsoft.com](https://entra.microsoft.com) (or the Azure
   portal) → **Identity → Applications → App registrations → New registration**.
2. **Name**: `Mono Mail Desktop` (or your branding).
3. **Supported account types** — pick one:
   - **Accounts in any organizational directory** (multitenant): any
     work/school tenant can sign in. Matches the default
     `MONO_ENV_MICROSOFT_TENANT=organizations`. ⚠ See the publisher-verification
     note below before distributing broadly.
   - **Accounts in this organizational directory only** (single tenant): only
     your tenant. Set `MONO_ENV_MICROSOFT_TENANT=<your Directory (tenant) ID>`.
4. **Redirect URI**: select platform **Public client/native (mobile & desktop)**
   and enter exactly:

   ```
   http://127.0.0.1
   ```

   Entra treats `127.0.0.1` as a loopback exception — the ephemeral port the
   app binds at sign-in time is ignored during matching, so no port needs to
   be registered.
5. Click **Register**.
6. On the Overview page, copy the **Application (client) ID** — this is
   `MONO_ENV_MICROSOFT_CLIENT_ID`. (For single-tenant, also copy the
   **Directory (tenant) ID**.)

---

## Step 2 — API permissions

1. **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions**.
2. Add:
   - `User.Read` (usually present by default)
   - `Mail.ReadWrite`
   - `Mail.Send`
   - `offline_access`
   - `openid`, `email`, `profile` (under *OpenId permissions*)
3. No application permissions, no admin-consent-required scopes — all of the
   above are user-consentable in tenants with default policies.

> **Tenants that block user consent**: some organizations require admin
> consent for any third-party app. An admin can pre-consent via
> **API permissions → Grant admin consent for <tenant>**, or through an
> admin-consent URL:
> `https://login.microsoftonline.com/<tenant>/adminconsent?client_id=<client-id>`

---

## Step 3 — No client secret

Skip **Certificates & secrets** entirely. The desktop flow is PKCE-only; the
refresh path also runs without a secret. (You do **not** need the
"Allow public client flows" toggle — that setting covers device-code/ROPC
flows, not authorization-code with a registered desktop redirect.)

---

## Step 4 — Set environment variables

In `.env.development` (gitignored; never commit credentials):

```dotenv
MONO_ENV_MICROSOFT_CLIENT_ID=<Application (client) ID>
MONO_ENV_MICROSOFT_TENANT=organizations   # or your Directory (tenant) ID
```

---

## Step 5 — Run the app

```bash
npm run dev
```

The **Sign in with Microsoft** button appears once the client ID is set
(env is baked at build time — restart `npm run dev` after editing). Clicking
it opens the system browser → Microsoft sign-in + consent → the tab closes
and the app is signed in. Adding further accounts works the same way.

---

## Distributing beyond your own tenant: publisher verification

Since November 2020, users in **other** tenants cannot consent to an
unverified multitenant app that requests anything beyond basic sign-in —
they'll see a "needs admin approval" / unverified-publisher block. Before any
broad rollout you need **publisher verification**:

- a Microsoft AI Cloud Partner Program (CPP/MPN) account as the Partner
  Global Account,
- a DNS-verified publisher domain (not `*.onmicrosoft.com`),
- an MFA-verified user to authorize the verification.

This is calendar time, not code — start early. Until then, other tenants can
still onboard via per-tenant **admin consent** (Step 2 note). Precedent for
open-source apps shipping a public client ID: Thunderbird ships one verified
public client ID.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Microsoft button doesn't appear | `MONO_ENV_MICROSOFT_CLIENT_ID` unset, or `npm run dev` not restarted after editing `.env.development`. |
| `AADSTS50011: redirect URI mismatch` | The registration's redirect URI must be exactly `http://127.0.0.1` under the **Public client/native** platform (not Web). |
| `AADSTS65001` / "Need admin approval" | Tenant blocks user consent — use the admin-consent URL from Step 2, or the app is unverified-multitenant (see publisher verification). |
| `AADSTS700016: application not found in directory` | Tenant mismatch: `MONO_ENV_MICROSOFT_TENANT` points at a tenant that doesn't know this app. Use `organizations` for multitenant registrations or the correct tenant ID for single-tenant. |
| `AADSTS7000218: client_assertion or client_secret required` | The redirect URI was registered under the **Web** platform (confidential client). Re-register it under **Public client/native (mobile & desktop)**. |
| Sign-in completes but inbox is empty | Expected until the Graph mail adapter lands (plan Phases 3–6). |
| `invalid_grant` on refresh after ~90 days idle | Public-client refresh tokens expire after 90 days of inactivity — the account is marked for re-auth; sign in again. |
