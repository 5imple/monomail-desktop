# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start in development mode (loads .env.development)
npm run build            # tailwind + typecheck + electron-vite build (production)
npm run lint             # ESLint with auto-fix
npm run typecheck        # Run both node and web TypeScript checks
npm run format           # Prettier
npm run mock-backend     # Start local mock API + WebSocket server on port 3030
npm run test:mock-backend  # Run mock-backend integration tests
```

`npm run typecheck:node` and `npm run typecheck:web` check the main-process and renderer-process tsconfigs separately. Run these independently to isolate which layer has type errors.

## Environment setup

Copy `.env.example` to `.env.development` (Vite loads this file in dev mode). All app variables use the `MONO_ENV_` prefix and are **baked in at build time** — changing `.env` requires a rebuild or restart of `npm run dev`.

For fully-local development without a real backend, set these three vars and run `npm run mock-backend`:

```
MONO_ENV_HOMEPAGE_DOMAIN=http://localhost:3030
MONO_ENV_API_URL=http://localhost:3030
MONO_ENV_BACKEND_URL=http://localhost:3030
```

The mock backend (`scripts/mock-backend.mjs`) implements the backend contract in `docs/ON_PREM_BACKEND_CONTRACT.md`. It serves stub threads/messages, handles account-link OAuth simulation, issues HMAC-signed tokens, and broadcasts push frames over WebSocket.

## Architecture

This is an **Electron app** with three separate process bundles built by `electron-vite`. Path alias `@/` maps to `src/` in all three.

### Three processes

**Main process** (`src/main/`) — Node.js, no DOM. Owns auth, tokens, IPC, push WebSocket, notifications, system tray, auto-update.

- `src/main/services/mangers/auth/TokenManager.ts` — persists tokens in Electron `safeStorage`; emits `token-changed` / `signed-out` events that drive the WebSocket push client.
- `src/main/services/mangers/auth/AuthManager.ts` — coordinates sign-in deep-link handling, account linking, token refresh.
- `src/main/services/push/WebSocketPushClient.ts` — long-lived WS connection to the backend; forwards frames to the renderer as `renderer:push:message-received` IPC.
- `src/main/services/app-events/index.ts` — `app.whenReady()` wiring: CSP headers, custom scheme (`monomail-app://`), deep-link protocol registration, IPC handler registration.
- `src/main/api/apiClient.ts` — singleton `fetch`-based client; base URL is `${MONO_ENV_API_URL}/api/v1`; handles retries, request dedup, and token injection.

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

### Auth and token flow

1. Sign-in: renderer opens `${MONO_ENV_HOMEPAGE_DOMAIN}/sign-in?client=web-electron` in the system browser. OAuth completes and deep-links back with `mono-desktop://signIn?token=...&refresh_token=...`.
2. Main process catches the deep link → `TokenManager` persists tokens → emits `token-changed` → WebSocket push client connects.
3. Renderer learns about sign-in via `renderer:auth:token-changed` IPC → `AuthContext` fetches user info and preference.
4. Add-account: client POSTs to `${MONO_ENV_BACKEND_URL}/desktop/account-link-intents` first, then opens `${MONO_ENV_HOMEPAGE_DOMAIN}/add-account?intent=...` in browser. Completion arrives via deep link `mono-desktop://addAccount?intent=...&code=...` and is finalized by POSTing to `/desktop/account-link-completions`.

### Push delivery

Push frames arrive over WebSocket (main process) and are forwarded to the renderer via `renderer:push:message-received` IPC. `MessageContext.handleIncomingMessage` dispatches on `data.type`: `MESSAGE_ADDED`, `MESSAGE_DELETED`, `LABEL_ADDED`, `LABEL_REMOVED`, `AI_DRAFT_ADDED`. The renderer fetches the full message from `GET /api/v1/mail/messages/:id` on `MESSAGE_ADDED`.

### Key models

- `MonoMessage` (`src/main/models/message/MonoMessage.ts`) — requires `payload` field; throws if missing. Always guard fetched message responses with `if (response?.payload)` before constructing.
- `MonoThread`, `MonoDraft` — plain-object models with `fromPlainObject` / `fromGmailMessage` static factories.

### UI conventions (from `.cursor/rules/design-rule.mdc`)

- Use **semantic color tokens** (`text-muted-foreground`, `bg-accent`) — never raw Tailwind color utilities (`bg-gray-200`, `text-red-500`).
- Use **`MonoIcon`** component instead of importing directly from `lucide-react`.
- Avoid explicit `type` attribute declarations unless the value is dynamic or contextual data.

### Mock backend (`scripts/mock-backend.mjs`)

`STUB_PREFERENCE` must match the `UserPreference` TypeScript type (`src/main/api/auth/types/user.ts`). The correct key is `notification` (singular) with `{ alertSound, watchNotification, marketingEmails, securityEmails }`. Using the wrong shape causes `mergeWithDefaultPreference` to throw, which is caught and logged as "Using cached preference due to API network error".
