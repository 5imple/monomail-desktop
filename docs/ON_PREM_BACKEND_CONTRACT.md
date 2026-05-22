# On-Prem Backend Contract

This document is the source of truth for what the on-prem backend must
expose so the Phase B desktop client (Firebase removed) works against it.

The desktop client (`src/main/api/apiClient.ts`) makes ~158 REST calls
against `MONO_ENV_API_URL`; the on-prem migration adds **four new
surfaces** the backend team must implement, plus moves three previously-
Cloud-Functions endpoints to the same backend origin.

---

## Env vars the desktop client reads

| Var                        | Required    | Default                                                                                               | Used for                                                                                                                                   |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONO_ENV_API_URL`         | yes         | –                                                                                                     | Existing REST API origin (e.g. `https://api.example.com`). All `apiClient.*` calls live under here, with `/api/v1` appended automatically. |
| `MONO_ENV_BACKEND_URL`     | no          | falls back to `MONO_ENV_API_URL`                                                                      | Origin for NPS, billing, refresh, share, push-WS. Set this if those routes live on a different host.                                       |
| `MONO_ENV_PUSH_WS_PATH`    | no          | `/push/ws`                                                                                            | Path on `MONO_ENV_BACKEND_URL` that hosts the WebSocket push channel.                                                                      |
| `MONO_ENV_PUBLIC_DOMAIN`   | recommended | falls back to `MONO_ENV_FIREBASE_AUTH_DOMAIN` (legacy)                                                | Public-facing domain for share links: `${MONO_ENV_PUBLIC_DOMAIN}/share/{shareId}`.                                                         |
| `MONO_ENV_UPDATE_FEED_URL` | recommended | falls back to `https://storage.googleapis.com/${MONO_ENV_FIREBASE_STORAGE_BUCKET}/releases/` (legacy) | URL of the auto-updater feed (electron-updater generic provider).                                                                          |
| `MONO_ENV_HOMEPAGE_DOMAIN` | yes         | –                                                                                                     | URL of the web sign-in page. The desktop client opens `${MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=web-electron`.                           |

All `MONO_ENV_FIREBASE_*` vars are no longer read by any code.

---

## 1 · Auth — OAuth deep-link → backend-issued JWT

### Sign-in flow

1. User clicks "Sign in with Google" in the desktop client.
2. Client opens `${MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=web-electron`
   in the system browser.
3. The web sign-in page runs the Google OAuth dance, gets the user's
   Google ID token, and exchanges it server-side for a **backend-issued
   access token + refresh token**. (Pre-Phase-B this was a Firebase custom
   token; now it's whatever JWT your backend mints.)
4. The web page redirects to:
   ```
   mono-desktop://signIn?token=<accessToken>&refresh_token=<refreshToken>&expires_in=3600
   ```

- `token` — the access token. The desktop client accepts JWT-shaped
  tokens (`xxx.yyy.zzz`, 32-8192 chars) and rejects malformed values before
  they reach the renderer.
- `refresh_token` — refresh token (any string ≥ 16 chars).
- `expires_in` — seconds until the access token expires. Optional, defaults
  to 3600.

5. The Electron main process catches the deep link and persists all three
   values in `safeStorage`. The renderer learns about sign-in via an IPC
   event (`renderer:auth:token-changed`).

### Add-account flow

Before opening the browser, the desktop client asks the backend to create
a short-lived account-link intent:

```
POST ${MONO_ENV_BACKEND_URL}/desktop/account-link-intents
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "provider": "gmail", "client": "web-electron" }
```

Response:

```json
{ "intent": "<opaque one-time value>", "expiresAt": "2026-05-22T12:00:00.000Z" }
```

The client then opens:

```
${MONO_ENV_HOMEPAGE_DOMAIN}/add-account?client=web-electron&provider=gmail&intent=<opaque>
```

The web page validates the intent server-side, runs Google OAuth, links the
mailbox to the existing member, creates a one-time completion code bound to
that intent/member, then redirects to:

```
mono-desktop://addAccount?intent=<opaque>&code=<one-time completion code>
```

The desktop main process then exchanges the completion code server-side:

```
POST ${MONO_ENV_BACKEND_URL}/desktop/account-link-completions
Authorization: Bearer <current accessToken>
Content-Type: application/json

{ "intent": "<opaque one-time value>", "code": "<one-time completion code>" }
```

Response 200:

```json
{
  "accessToken": "<new backend access token>",
  "refreshToken": "<new backend refresh token>",
  "expiresIn": 3600
}
```

The desktop client treats this as adding a secondary mailbox to the
existing session — the returned token replaces the active session's.
Do not put member tokens, refresh tokens, or bearer tokens in the browser URL;
only the opaque intent and one-time completion code belong there.

For migration compatibility, the current desktop client still accepts the
older `mono-desktop://addAccount?token=…&refresh_token=…` form, but new
production implementations should use the completion-code exchange above.

### `POST ${MONO_ENV_BACKEND_URL}/auth/refresh`

**Request** (`Content-Type: application/json`):

```json
{ "refreshToken": "<the refresh token>" }
```

**Response 200**:

```json
{
  "accessToken": "<new access token>",
  "refreshToken": "<new refresh token (rotation OK)>",
  "expiresIn": 3600
}
```

- `refreshToken` is optional. Omit to keep the current refresh token; include
  to rotate it (recommended).
- `expiresIn` is optional. Defaults to 3600s.

**Response 401 or 403**:
The client treats the session as terminated and clears local tokens. Return
this when the refresh token is revoked, expired, or unknown.

**Response 5xx**:
The client backs off and retries on next API call or scheduled refresh
(approximately 60s before access token expiry).

### How the access token is sent

Every existing REST call already does this. No new behaviour:

```
Authorization: Bearer <accessToken>
```

The token is passed by `apiClient` in main — the renderer never holds it
in JS-readable storage. (When the renderer needs to issue a direct fetch
— e.g. NPS or billing — it pulls the token from main via IPC.)

---

## 2 · Push — WebSocket replaces FCM

### Endpoint

```
WSS ${MONO_ENV_BACKEND_URL}${MONO_ENV_PUSH_WS_PATH}?token=<accessToken>
```

The access token is passed as a query parameter for connection-time auth.
You may alternatively read it from an `Authorization: Bearer …` header if
your ingress supports header forwarding on the WS upgrade (the `ws`
library in main supports either via custom headers if needed; ping us
to switch).

### Frames the backend sends (JSON, one per WS message)

Shape matches the legacy FCM `MessagePayload` envelope, so the client-side
handler in `MessageContext.tsx` is unchanged:

```jsonc
{
  "data": {
    "type": "MESSAGE_ADDED",
    "aAUid": "<account uid this event belongs to>",
    "threadId": "<gmail thread id>",
    "id": "<message id>",
    "labels": "[INBOX, UNREAD]", // bracketed comma-list
    "verification": "false", // "true" | "false"
    "link": "",
    "code": ""
  },
  "notification": {
    "title": "Sender Name <sender@example.com>",
    "body": "Preview of the message body…"
  }
}
```

Other `data.type` values the client handles:

- `"AI_DRAFT_ADDED"` — `{ aAUid, threadId, id }`
- `"MESSAGE_DELETED"` — `{ aAUid, threadId, id }`
- `"LABEL_ADDED"` — `{ aAUid, threadId, id, labels }`
- `"LABEL_REMOVED"` — `{ aAUid, threadId, id, labels }`

### Control frames (no `data` field)

Anything without a top-level `data` object is treated as control traffic
and dropped before reaching the renderer. Use this for app-layer health
checks or backend-only signals.

### Heartbeat / liveness

- Client sends a `ping` every 25 seconds (standard WS-level `ping`/`pong`).
- If 60 seconds pass with no `pong` or message, the client reconnects.
- Backend can also send pings; client replies with `pong` automatically.

### Auth failures

If the access token is rejected at the WS level, close with one of:

- `1008` (policy violation) — generic
- `4401` (custom: auth failed)
- `4403` (custom: forbidden)

The client triggers `/auth/refresh` and reconnects once. If refresh fails,
the client signs out.

### Reconnect behaviour

Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap). The client
resets backoff to 1s on every successful `open`. Backend should expect
clients to come back within a few seconds of any non-1008/4xxx close.

---

## 3 · Ported Cloud Functions endpoints

These previously lived on `https://us-central1-${PROJECT_ID}.cloudfunctions.net/…`.
Move them under `MONO_ENV_BACKEND_URL` — the client now hits the same paths
on the new origin. All require `Authorization: Bearer <accessToken>`.

### `GET ${BACKEND_URL}/nps/entries`

Returns the user's NPS history.

**Response 200**:

```jsonc
{
  "entries": [
    {
      "id": "...",
      "score": 9,
      "comment": "...",
      "userEmail": "...",
      "eventType": "feature_usage",
      "createdAt": "ISO 8601",
      "updatedAt": "ISO 8601",
      "userId": "..."
    }
  ],
  "totalCount": 1
}
```

### `POST ${BACKEND_URL}/nps`

Creates an NPS entry.

**Request body** (`Content-Type: application/json`):

```json
{
  "score": 9,
  "comment": "optional",
  "eventType": "feature_usage"
}
```

Valid `eventType` values: `subscription_renewal`, `feature_usage`,
`support_interaction`, `onboarding_complete`, `general_feedback`,
`product_update`, `cancellation_flow`, `third_email`.

**Response 200**: created entry shape (same as `/nps/entries` items).

### `GET ${BACKEND_URL}/payment/payment-info`

Returns the active subscription + any one-time purchase.

**Response 200**:

```jsonc
{
  "subscription": {
    "productName": "Mail Pro",
    "variantName": "Annual"
    /* …whatever the legacy Cloud Function returned… */
  },
  "order": null,
  "hasOneTimePurchase": false
}
```

**Response 404**: client treats as "no active subscription":

```json
{ "subscription": null, "order": null, "hasOneTimePurchase": false }
```

---

## 4 · Share-link host

`LinkShareDropdownItem.tsx` resolves share URLs as:

```
${MONO_ENV_PUBLIC_DOMAIN}/share/${shareId}
```

The backend must serve `/share/:id` either as a static page that resolves
the share, or a redirect to the appropriate viewer. Pre-Phase-B this lived
on the Firebase Hosting domain; now it must live on your public domain.

---

## 5 · Auto-updater feed

`UpdateManager.ts` configures electron-updater with the `generic` provider
pointing at `MONO_ENV_UPDATE_FEED_URL`. The directory must serve:

- `latest-mac.yml` (electron-updater manifest)
- `latest-mac.json` (optional, some channels)
- The actual `.dmg` / `.zip` artifacts referenced by the YAML.

Any HTTPS host that serves static files works — S3, R2, MinIO, nginx,
GitHub Releases.

The `electron-builder.yml` `publish:` block still references
`MONO_ENV_FIREBASE_STORAGE_BUCKET` and should be migrated to use
`MONO_ENV_UPDATE_FEED_URL` directly. (Filed as a follow-up; the build
will still work because electron-updater's runtime feed URL takes
precedence over the embedded `app-update.yml`.)

---

## 6 · Account model assumptions

The client passes `X-Mono-Account: <uid>` on most multi-account API
calls. Your backend's existing `/api/v1/...` surface already supports
this — no change. The single JWT issued at sign-in is the _user_ identity;
per-account context is selected via the header.

---

## 7 · Migration checklist (backend team)

- [ ] Web sign-in page issues backend JWTs in the deep link (not Firebase
      custom tokens). Redirect URL includes `token`, `refresh_token`,
      `expires_in`.
- [ ] `POST /auth/refresh` endpoint.
- [ ] WebSocket endpoint at `MONO_ENV_PUSH_WS_PATH` (default `/push/ws`).
      Auth via `?token=` query param. Send `data`-shaped frames; honour
      ping/pong; close with 4401/4403/1008 on auth failure.
- [ ] `GET /nps/entries`, `POST /nps`, `GET /payment/payment-info` ported
      from Cloud Functions to your backend origin (or a sibling origin if
      `MONO_ENV_BACKEND_URL` differs from `MONO_ENV_API_URL`).
- [ ] `/share/:id` route on `MONO_ENV_PUBLIC_DOMAIN`.
- [ ] Updater feed (S3/R2/nginx/whatever) at `MONO_ENV_UPDATE_FEED_URL`.

When all six are live, set the env vars in the client's build environment,
ship a new desktop release, and Firebase can be fully shut down.
