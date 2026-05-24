# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start in development mode (loads .env.development)
npm run build            # tailwind + typecheck + electron-vite build (production)
npm run lint             # ESLint with auto-fix
npm run typecheck        # Run both node and web TypeScript checks
npm run format           # Prettier
```

`npm run typecheck:node` and `npm run typecheck:web` check the main-process and renderer-process tsconfigs separately. Run these independently to isolate which layer has type errors.

## Environment setup

Copy `.env.example` to `.env.development` (Vite loads this file in dev mode). All app variables use the `MONO_ENV_` prefix and are **baked in at build time** — changing `.env` requires a rebuild or restart of `npm run dev`.

The app runs **Gmail-direct only**: set `MONO_ENV_GOOGLE_CLIENT_ID` and `MONO_ENV_GOOGLE_CLIENT_SECRET` (see `docs/GOOGLE_OAUTH_SETUP.md`). Sign-in is a direct Google OAuth (PKCE) flow handled in the main process; mail goes straight to the Gmail API via the IPC bridge. There is no first-party "Mono account" and no cloud sign-in backend.

`MONO_ENV_API_URL` is **optional** — it only powers secondary feature modules (signatures, templates, spaces, bookmarks, tracking, contacts, reminders, server-side/AI drafts). Left blank, those features no-op and `apiClient` logs non-fatal `"Backend not configured"` errors.

## Architecture

This is an **Electron app** with three separate process bundles built by `electron-vite`. Path alias `@/` maps to `src/` in all three.

### Three processes

**Main process** (`src/main/`) — Node.js, no DOM. Owns auth, tokens, IPC, push WebSocket, notifications, system tray, auto-update.

- `src/main/services/mangers/auth/TokenManager.ts` — persists Google OAuth tokens in Electron `safeStorage` (one set per connected Gmail account); refreshes against `oauth2.googleapis.com`; emits `token-changed` / `signed-out`.
- `src/main/services/mangers/auth/GoogleOAuthServer.ts` — runs the direct Google OAuth (PKCE) flow used for sign-in and add-account.
- `src/main/services/push/GmailHistoryPoller.ts` — polls Gmail `users.history.list` per account and forwards changes to the renderer as `renderer:push:message-received` IPC (same envelope the renderer already consumes).
- `src/main/services/app-events/index.ts` — `app.whenReady()` wiring: CSP headers, custom scheme (`monomail-app://`), deep-link protocol registration, IPC handler registration.
- `src/main/api/apiClient.ts` — singleton `fetch`-based client; base URL is `${MONO_ENV_API_URL}/api/v1`; handles retries, request dedup, and token injection. Also exports `gmailApiClient` (base: `https://gmail.googleapis.com/gmail/v1/users/me`) which routes through the IPC bridge via `electronBridge.gmailRequest` to avoid CORS.

**Preload** (`src/preload/index.ts`) — Runs in renderer context with Node access. Exposes `window.electronBridge` via `contextBridge`. All IPC channel names are declared in `src/main/validChannels.ts` and validated before use. Async callbacks passed to `api.on()` must be wrapped so Promise rejections are caught.

**Renderer** (`src/renderer/`) — React 18 SPA. Accesses Electron IPC only through `src/renderer/app/lib/electronApi.ts` (which reads `window.electronBridge`). The `isElectron` flag in that module gates code that should only run inside Electron.

### Renderer state and data flow

- **Jotai atoms** in `src/renderer/app/store/` — fine-grained reactive state for threads, drafts, spaces, layout, labels, etc.
- **React Contexts** in `src/renderer/app/context/` — coordinate cross-cutting concerns:
  - `AuthContext` — user, accounts, preference, sign-in/sign-out lifecycle.
  - `MessageContext` — receives push frames from main via IPC; notifies subscribers; debounces label-change updates to avoid thrashing the thread list.
  - `SyncThreadContext` / `SyncHistoryContext` — Gmail history sync and incremental thread loading.
  - `ThreadListContext` — search query, selected labels, active threads.
- **IndexedDB** (`src/renderer/app/lib/db/`) — local cache for threads, messages, drafts, contacts. Accessed through typed helpers (`DBGetThread`, `DBSaveMessage`, etc.). Schema migrations are in `src/renderer/app/lib/db/migrations/`.

### Thread list rendering

Two row variants controlled by `preference.appearance.density`:
- `ThreadListCozyItem` — default, taller rows with avatar
- `ThreadListDenseItem` — compact single-line rows

Both use `IntersectionObserver` with a `rootMargin` pre-render buffer to virtualise long lists — items outside the viewport render a fixed-height placeholder and set `opacity-0`. The outer container needs `class="group"` for `group-hover:opacity-100` checkbox visibility to work.

Subject and snippet text from the Gmail API arrives **HTML-entity-encoded** (e.g. `&#39;` for `'`). `highlightThreadText` in `src/renderer/app/lib/highlightThreadText.ts` decodes these entities before re-escaping, so `dangerouslySetInnerHTML` renders the correct characters instead of literal entity strings.

### Auth and token flow

1. Sign-in: `SignInLayout` calls `electronApi.initiateSignIn()` → main runs the Google OAuth (PKCE) flow via `GoogleOAuthServer` → `TokenManager` persists tokens and a local member profile → emits `token-changed`.
2. Renderer learns about sign-in via `renderer:auth:token-changed` IPC (mirrored by `monoAuth`) → `AuthContext` builds accounts/member from the local token store and loads preferences from the local cache.
3. Add-account: `startEmailAccountLink()` calls `electronApi.initiateAddAccount()` → another PKCE flow → the new Google account is stored locally → `renderer:auth:add-account` IPC triggers `AuthContext.updateAccounts()`.

### Push delivery

New-mail detection is poll-based. `GmailHistoryPoller` (main) polls each account's Gmail history and emits frames over `renderer:push:message-received`; `SyncThreadContext` / `SyncHistoryContext` (renderer) also poll the Gmail API directly. `MessageContext.handleIncomingMessage` dispatches on `data.type`: `MESSAGE_ADDED`, `MESSAGE_DELETED`, `LABEL_ADDED`, `LABEL_REMOVED`. On `MESSAGE_ADDED` it fetches the full message directly from the Gmail API.

### Titlebar layout

The app uses `titleBarStyle: 'hidden'` with `trafficLightPosition: { x: 12, y: 16 }`. A full-width `h-11` titlebar strip in `AppLayout` carries `class="drag"` (maps to `-webkit-app-region: drag`) so the user can drag the window. Interactive elements inside it (buttons, nav tabs) must carry `class="no-drag"` to remain clickable. The strip uses `bg-background` to match the macOS inset-area color to the app content.

### Key models

- `MonoMessage` (`src/main/models/message/MonoMessage.ts`) — requires `payload` field; throws if missing. Always guard fetched message responses with `if (response?.payload)` before constructing.
- `MonoThread`, `MonoDraft` — plain-object models with `fromPlainObject` / `fromGmailMessage` static factories.

### UI conventions

- Use **semantic color tokens** (`text-muted-foreground`, `bg-accent`) — never raw Tailwind color utilities (`bg-gray-200`, `text-red-500`).
- Use **`MonoIcon`** component (`src/renderer/app/components/icons/icons.tsx`) instead of importing directly from `lucide-react`. Icons are SVGs exported from `src/renderer/app/components/icons/svg/index.ts`.
- Avoid explicit `type` attribute declarations unless the value is dynamic or contextual data.
- Thread list rows use `mx-[10%]` for side margins; section headers and filter tabs use `px-[10%]` to align.

### Preferences

User preferences are **local-only** (no backend sync). `AuthContext` reads/writes them through `authCache` (IndexedDB via `monoLocalStorageDb`), merged against `defaultPreference` by `mergeWithDefaultPreference`.
