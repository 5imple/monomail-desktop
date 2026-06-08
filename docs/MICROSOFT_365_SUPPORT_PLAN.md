# Microsoft 365 Mail Support — Implementation Plan (Amended)

> Status: reviewed & amended 2026-06-04, against branch `gh-pages` (working tree).
> Provenance: original draft plan + a multi-agent audit of this codebase (6 subsystem
> audits, 4 follow-up traces, completeness critique) + Microsoft Graph / identity
> platform research. Amendments are tagged **[AMENDED]** / **[ADDED]** with
> file:line evidence from the audit. Everything else carries over from the draft.

## Summary

Add Microsoft 365 work/school mail support as a first-class provider in the unified
inbox. The desktop app keeps owning OAuth tokens and direct mail operations through
Microsoft Graph, mirroring the existing standalone Google-direct design
(`gmailApiClient` → IPC bridge → main-process tokens).

**[AMENDED] New-mail delivery ships in two stages.** v1 uses a provider-neutral
**delta poller** in the main process (no infrastructure); the Graph **push relay
becomes v2**. Rationale: Graph change notifications require a public HTTPS
`notificationUrl` a desktop app cannot expose, the relay is mandatory hosted
infrastructure for an MIT-licensed app, and the WebSocket scaffold the relay would
extend is currently dead code — `WebSocketPushClient.getInstance()` is never called
anywhere in `src/main` (only comment references at
`src/main/services/ipc-handlers/index.ts:14` and `.../queue/index.ts:15`), so even
Gmail standalone delivery is broken today after `GmailHistoryPoller.ts` was deleted.

This plan assumes:

- Microsoft 365 **work/school accounts only** (tenant `organizations`).
- Unified inbox with Gmail + Microsoft accounts together.
- Mail parity for v1: sign in, list/read/search, send/reply, labels/folders,
  archive/delete, read/unread, star/flag, attachments, multi-account.
- v1 freshness via delta polling; relay push in v2.

Microsoft docs:

- Auth code + PKCE: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- Message delta: https://learn.microsoft.com/en-us/graph/delta-query-messages
- Immutable IDs: https://learn.microsoft.com/en-us/graph/outlook-immutable-id
- sendMail: https://learn.microsoft.com/en-us/graph/api/user-sendmail
- Attachments / upload sessions: https://learn.microsoft.com/en-us/graph/outlook-large-attachments
- JSON batching: https://learn.microsoft.com/en-us/graph/json-batching
- Subscriptions (v2): https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions
- Publisher verification: https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview

---

## Amendments index

| # | Amendment | Class | Phases |
|---|-----------|-------|--------|
| A1 | `Prefer: IdType="ImmutableId"` on **every** Graph request (including resumed delta nextLink/deltaLink calls); primary key = immutable id, `internetMessageId` as secondary metadata | Silent data corruption | 4, 5, 9, 10 |
| A2 | Fix Gmail id-length heuristics (`id.length < 20`) that misclassify ~150-char Graph ids | Silent data corruption | 5 |
| A3 | Delta poller v1; push relay demoted to v2; add lifecycle-notification handling to relay design | Architecture | 11 |
| A4 | `sendMail` MIME 4 MB cap: size guard in v1, draft + upload-session path for large mail | Correctness | 7, 8 |
| A5 | Resolve Drafts contradiction: Drafts folder **excluded** from v1 delta sync; Microsoft compose drafts are local-only | Consistency | 10 |
| A6 | Publisher verification is release-gating with lead time — start at Phase 1, not Phase 15 | Process | 15 |
| A7 | CSP `connect-src` + `validChannels.ts` allow-list additions | Would block everything | 2, 4 |
| A8 | Provider-gate People-API avatar/autocomplete call sites (they **throw** for non-Google uids) | Hard failure | 12, 14 |
| A9 | `$batch` for message hydration; respect 4-concurrent-per-mailbox cap | Throttling | 6 |
| A10 | Persist rotated Microsoft refresh token on every refresh | Token loss | 1 |
| A11 | Archive via well-known name only (display names are localized) | Correctness | 9 |
| A12 | `prompt=select_account` (not `consent`) | UX | 2 |
| A13 | Budget the Gmail-label leakage sweep (~40 renderer files past the adapter seam) | Scope honesty | 3, 5, 13 |
| A14 | Dev/testing reality: Graph fixture server + M365 Developer Program sandbox tenant | Process | 16 |

---

## Phase 0: Stabilize Current App First

Before adding M365, make the current tree compile. **[AMENDED]** — verified breakage,
exact errors (note: `npm run typecheck` short-circuits — `typecheck:node &&
typecheck:web` — so a naive run shows only the node errors; both passes were run
directly with `npx tsc --noEmit -p <tsconfig> --composite false` and all 4 errors
are confirmed real in the current tree):

- node pass: `src/main/services/scheduler/SchedulerService.ts:234,240,243` read
  `req.raw` / `req.threadId`, removed from `CreateScheduleRequest`
  (`src/main/api/queue/types.ts`).
- web pass: `src/renderer/app/components/card/compose/ComposeCardFooter.tsx:237`
  — `Property 'resolvedUid' does not exist on type '{ ok: true; item:
  ScheduledItem; ... }'`.
- Reconcile the queue/scheduler contract. Recommended (as in the draft): split into
  `BackendCreateScheduleRequest` and `LocalCreateScheduleRequest` so scheduled-send
  behavior is explicit. The standalone-vs-backend "Later" architecture decision must
  be made here — the subsystem is mid-migration between `SchedulerService` (local)
  and `queueApi` (backend).
- **[AMENDED]** Restore standalone new-mail delivery for *Gmail* as part of Phase 0
  or 11: `GmailHistoryPoller.ts` is deleted and `WebSocketPushClient` is never
  instantiated (`app-events/index.ts:106` starts only `schedulerService`), so no
  delivery path is live at all. The provider-neutral delta poller (Phase 11)
  resolves this for both providers; don't build a Gmail-only stopgap.
- The draft's "register missing reminder IPC handlers (`main:reminder:*`)" claim was
  **not confirmed** by the audit — verify against `src/preload/index.ts` before
  acting on it.
- Green `npm run typecheck` is the starting line for M365 work.

## Phase 1: Provider Model and Token Storage

### Provider types

As drafted: `MailProvider = 'google' | 'microsoft'`, `StoredMailAccount`,
`MailAccountTokenSet`, with `providerMeta` for Microsoft
(`{ tenantId, objectId, userPrincipalName }`) and UID format
`microsoft:${tenantId}:${objectId}` (Google keeps its `sub`).

Evidence the seams exist but are unused: `MonoAccount.provider` is already
`'google' | 'microsoft'` (`src/main/api/auth/types/user.ts:57`); the Outlook icon
exists; `OnBoardingAddAccounts.tsx:43-51` has an Outlook tile with `supported:false`.

- **[ADDED]** Verify the uid charset survives every consumer: IndexedDB keys,
  WS frame `aAUid`, notification metadata, and `SystemManager.getKnownAccountUids()`
  (`src/main/services/mangers/system/SystemManager.ts:123-128`). Colons are likely
  fine but cheap to confirm once.

### TokenManager changes

As drafted (migrate `googleAccounts` → provider-neutral `mailAccounts` with
Google-named wrappers kept during migration). The coupling to break, verified:

- `TokenManager.ts:23` — `provider?: 'google' | 'backend'` union; non-google is
  silently treated as backend in `saveTokens` (L209) and `doRefresh` (L325).
- `TokenManager.ts:29-41,158-174,217-259,281-298` — `googleAccounts` map and all
  Google-named accessors; `'google-accounts-changed'` event.
- `TokenManager.ts:56-61` — `DIRECT_GOOGLE_SCOPES` baked into stored accounts;
  Microsoft accounts must store Graph scopes instead.
- `TokenManager.ts:292` — `getGoogleAccountAccessToken` **throws**
  `No Google account token found` for unknown uids; every uid-keyed token lookup
  must dispatch on provider first.

### Microsoft refresh

As drafted (`POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`,
`grant_type=refresh_token`, scopes included). Failure handling as drafted
(invalid_grant/401/403 → mark expired + notify renderer; network/5xx → keep and
retry).

- **[ADDED — A10]** Microsoft **rotates the refresh token on every redemption**:
  each refresh response contains a new RT with renewed lifetime; the old one must be
  discarded. `refreshMailAccount` must persist the returned RT every time. The
  Google path (`doGoogleRefresh`, `TokenManager.ts:328-424`) does not rotate, so do
  not copy its persistence behavior blindly. Public-client RTs last up to 90 days
  idle; rotation-on-use keeps an active account signed in indefinitely.

## Phase 2: Microsoft OAuth

### Environment

```
MONO_ENV_MICROSOFT_CLIENT_ID=
MONO_ENV_MICROSOFT_TENANT=organizations
```

No Microsoft button if `MONO_ENV_MICROSOFT_CLIENT_ID` is empty.
**[AMENDED — A3]** The relay env vars (`MONO_ENV_GRAPH_PUSH_RELAY_URL`,
`MONO_ENV_GRAPH_NOTIFICATION_URL`) move to v2; v1 freshness comes from the delta
poller and needs no configuration.

### OAuth server

`MicrosoftOAuthServer`, modeled on `GoogleOAuthServer`
(`src/main/services/mangers/auth/GoogleOAuthServer.ts` — loopback 127.0.0.1, PKCE
S256, profile fetch, avatar fetch). This raw-PKCE clone is deliberately preferred
over `@azure/msal-node`: MSAL hides the raw refresh token, which is incompatible
with TokenManager's direct token-endpoint refresh design.

Flow as drafted, with corrections:

- **[AMENDED — A12]** `prompt=select_account`, not `consent`. `consent` forces the
  full grant screen on every sign-in; the consent prompt appears automatically on
  first authorization. Note Google-only params (`access_type=offline`,
  `prompt=consent` at `GoogleOAuthServer.ts:6-18`) must NOT be copied — Microsoft
  offline access comes from the `offline_access` scope.
- Profile: `GET https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName`;
  avatar: `GET /me/photo/$value` (404 is normal — many accounts have no photo).
- **[ADDED — A7]** `src/main/services/app-events/index.ts:119-176` injects a CSP
  `connect-src` and CORS handling hardcoded to Google hosts. Add
  `https://login.microsoftonline.com` and `https://graph.microsoft.com` or every
  Microsoft request dies at the session layer regardless of the rest of this plan.

### Auth IPC

As drafted (`main:auth:initiate-microsoft-sign-in`, `initiate-microsoft-add-account`,
`remove-mail-account`, `get-mail-account-token`), added in
`src/main/services/ipc-handlers/auth/index.ts` alongside the Google handlers.

- **[ADDED — A7]** Register every new channel in `src/main/validChannels.ts`
  (allow-list) or the bridge silently rejects them.

### Renderer auth

As drafted. The single mapping point is
`AuthContext.tsx` `buildDirectGoogleAccountResponse` — `provider:'google'` is
hardcoded at line 109; it becomes a provider-carrying map over
`tokenManager.getMailAccounts()`.

`accountLinking.startEmailAccountLink(provider)` currently ignores its provider arg
and always calls `electronApi.initiateAddAccount()` — route `'microsoft'` to the new
IPC. (The mock backend's `/desktop/account-link-intents` rejects
`provider !== 'gmail'` at `scripts/mock-backend.mjs:380-385`, but that flow is not
used in standalone — native OAuth is the path; no mock change needed for auth.)

## Phase 3: Provider-Aware Mail API

As drafted: keep renderer call sites on `mailApi`, dispatch by
`getProviderForUid(uid)`, implement `googleMailProvider` (current behavior) and
`microsoftMailProvider` behind the `MailProviderAdapter` interface (signatures as in
the draft).

- **[AMENDED — A13]** The adapter seam is necessary but **not sufficient**, and the
  draft understates this. Gmail label/query strings leak past `transforms.ts` into
  ~40 renderer files. Verified leak sites that consume raw Gmail semantics:
  `MailNavTabs.tsx:17`, `convertToAccurateQuery.ts:7`,
  `lib/db/thread/index.ts:9-91`, `customSearch.ts:544`, `useThreadLabels.ts`,
  `MonoMessage.isDraft` (`MonoMessage.ts:148`). Phase 5's normalized labels cover
  most consumers *if* the Microsoft adapter emits normalized `labelIds`, but budget
  an explicit sweep of these files as its own work item — "transforms insulate
  everything" was the single most overstated premise found in the audit.

## Phase 4: Graph IPC and Client

As drafted (`main:graph:request` with method/path/uid/headers/body/responseType;
path validation; base host `https://graph.microsoft.com/v1.0`; delta links stored
main-side and origin-validated). Modeled on the Gmail handler
(`src/main/services/ipc-handlers/gmail/index.ts:18-20,118,164,213` — which resolves
bearers via `getGoogleAccountAccessToken`; the Graph handler resolves via the
provider-aware accessor from Phase 1).

- **[ADDED — A1]** The Graph helper sends `Prefer: IdType="ImmutableId"` on **every
  request**, unconditionally, from the first commit. Without it, Graph message ids
  change on folder move, so this plan's own archive/trash operations (moves) would
  invalidate every cached id — moves become delete+create and the store desyncs.
  Retrofitting later requires a `translateExchangeIds` migration of all stored data.
  (Document the caveat: even immutable ids change on archive-*mailbox* moves/exports.)
  **Delta paging included**: `@odata.nextLink`/`@odata.deltaLink` URLs are opaque,
  but headers are per-request — resumed delta calls must still carry the Prefer
  header. Routing *all* delta paging through this same helper makes that automatic;
  never fetch a stored delta URL through a raw client.
- **[ADDED — A9]** Add a `$batch` helper (POST `/v1.0/$batch`, max 20 ops) in the
  same module; Phase 6 depends on it. Batching does **not** remove throttling:
  subrequests are throttled individually, so the helper must inspect each
  subresponse's status and retry 429 items individually with their own
  `Retry-After` — a 200 on the batch envelope proves nothing about its items.
- Workers reach Graph through host messages (`GRAPH_API_REQUEST`/`GRAPH_API_RESPONSE`),
  mirroring the Gmail worker bridge.

## Phase 5: Graph Data Mapping

`$select` field lists as drafted (list + detail). Keep `internetMessageId` and
`internetMessageHeaders` in detail — they're needed for A1/A2 and reply threading.

### Normalize to existing models

As drafted (Graph message → `MonoMessage`, synthetic MIME-ish payload, set
`bodyHtml`/`bodyPlain` directly), with these corrections:

- **[AMENDED — A1]** `id` → Graph **immutable** message id — this is the **primary
  key**. Store `internetMessageId` as **secondary metadata only**: it can be absent
  (drafts), duplicated across odd mail flows, or mangled by malformed senders — do
  NOT build a composite key with it. Group threads on `conversationId` but treat it
  as supplementary: it is known-unreliable across external replies (Exchange
  Thread-Index heuristics). v1 may group by `conversationId`; keep RFC 5322
  References-based regrouping as a known v2 improvement rather than discovering it
  as a bug.
- **[ADDED — A2]** Fix the id-shape heuristics before any Microsoft message enters
  the store. Verified sites that branch on `id.length < 20`:
  - `lib/db/thread/index.ts:578` — historyId bootstrap from "latest thread";
  - `lib/db/draft/index.ts:34` — compose-UUID vs real-thread discrimination;
  - `store/draft/useDraftAtom.ts:326` — same heuristic.
  Graph ids are ~150 chars; every one lands in the wrong branch *silently* —
  breaking draft-vs-thread logic and reply threading with no error surfaced.
  Replace with an explicit provider/id-kind tag.
- `historyId` → `null` for Graph messages (as drafted); the Microsoft sync cursor
  lives in per-folder delta state (Phase 10), not on messages.
- Body rendering: prefer `uniqueBody` for the reply fragment; never trust
  `hasAttachments` for inline-only mail; `cid:` images are resolved via the
  attachments collection (Phase 7), not MIME-tree parsing — for Microsoft messages
  there is no raw MIME tree, so `transforms.walkParts` (`transforms.ts:131-159`)
  does not run; the adapter populates `inlineImages`/`attachments` maps from Graph
  attachment metadata (`isInline` + `contentId`) to keep `MessageCard`'s existing
  IntersectionObserver pipeline (`MessageCard.tsx:324-452`) untouched.

### Label and folder mapping

As drafted (well-known folders → `INBOX/SENT/DRAFT/TRASH/SPAM`; Archive → neither;
`isRead=false` → `UNREAD`; `flagStatus==='flagged'` → `STARRED`;
`folder:<graphFolderId>`, `category:<categoryName>`; no `CATEGORY_*` for Microsoft).

Notes from research: categories are display-name strings against a per-mailbox
master list with a fixed 25-color preset enum — display only in v1, no color
management. Focused/Other (`inferenceClassification`) is intentionally **not**
mapped onto Gmail tabs; they are different axes.

## Phase 6: Microsoft Thread List and Search

Query translation and thread-list algorithm as drafted (folder/filter/search
strategy → fetch → group by `conversationId` → `MonoThread`), with:

- **[ADDED — A9]** Hydrating a conversation or a page of threads must use `$batch`
  (20 ops/request). Outlook enforces a hard **4 concurrent requests per mailbox**
  cap (plus 10,000 requests / 10 min / app / mailbox); a naive per-message fan-out
  trips it immediately. Honor `Retry-After` on 429 everywhere.
- **[AMENDED]** `$search` (KQL) constraints to encode in the translator: cannot
  combine with `$filter` or `$orderby`, ~1000-result cap, sent-date ordering only,
  limited paging. Unsupported Gmail operators fall back to local IndexedDB search
  without a hard error (as drafted). **UI contract for limited search**: show
  local cached results plus a subtle "results may be limited" notice — never an
  empty state that looks authoritative when the provider search was capped or the
  operator unsupported.
- `$filter=conversationId eq '...'` for conversation expansion, with the draft's
  cached-messages fallback if a tenant misbehaves.
- Pagination via opaque `@odata.nextLink` as `nextPageToken` (as drafted).

## Phase 7: Attachments and Inline Images

The current module is fully Gmail-hardwired — verified:
`src/main/api/mail/attachment/index.ts:1,22,42` imports and calls `gmailApiClient`
directly; `base64urlToBase64()` (`:6-8`) exists because Gmail returns base64**url**;
`mimeType:''` is hardcoded (`:31`) because Gmail's endpoint omits it (recovered from
the MIME tree); the download Blob has no MIME type (`:50`); `_fileName` (`:39`) is
unused. Renderer contract is `(uid, messageId, attachmentId)` from
`MonoAttachment.attachmentId` across `MessageCard.tsx:388`, `ReferenceCard.tsx:88`,
`AttachmentCard.tsx:67`, `AttachmentItem.tsx:58`, `AttachmentGridItem.tsx:62`,
`CalendarEventCard.tsx:199`, `AttachmentPreviewDialog.tsx:71`.

Microsoft adapter implementation:

- `GET /me/messages/{id}/attachments` → map `fileAttachment` as drafted
  (`id/name/contentType/size`, `isInline`+`contentId` → inline map). Two
  differences from Gmail, both favorable: `contentBytes` is **standard base64**
  (skip `base64urlToBase64`), and `contentType` comes from the endpoint (no
  `mimeType:''` hack; also set the Blob's MIME type, fixing preview sniffing).
- Inline (`cid:`) rendering reuses the existing pipeline: the adapter fills
  `inlineImages[contentId]` so `processInlineImages` (`src/main/utils.ts:450-474`)
  and `MessageCard`'s lazy loader work unchanged.
- `referenceAttachment` / `itemAttachment`: show the row, surface "unsupported
  attachment type" on download — never silently drop (as drafted).
- **[ADDED — A4]** Large outbound attachments: see Phase 8.

## Phase 8: Sending and Replying

As drafted — Graph `sendMail` in MIME mode reusing `buildRawMessage`
(`src/renderer/app/lib/mime/buildRawMessage.ts` already emits standard base64 parts
via chunked `btoa`; only the envelope base64url→base64 conversion is needed), MIME
replies preserving `In-Reply-To`/`References`, sent mail lands in Sent Items
automatically.

- **[ADDED — A4, revised]** Large mail via `sendMail` MIME hits a hard ceiling.
  What's documented: attachments **> 3 MB require an upload session on a draft**
  (3–150 MB; https://learn.microsoft.com/en-us/graph/outlook-large-attachments);
  the canonical `user-sendmail` page documents **no explicit MIME-mode size cap**
  (verified 2026-06-04) — the oft-cited 4 MB figure is the general Graph
  request-body limit, not a sendMail constant. v1 policy: enforce a **conservative
  app threshold** (~3 MB total attachment payload / ~4 MB encoded MIME) with a
  clear, actionable error; verify the real ceiling empirically against a sandbox
  tenant before raising it. Proper path (v1.5): `POST /me/messages` (draft) →
  upload session per large file → `POST /me/messages/{id}/send`. Decide which
  ships in v1 before compose UX is finalized — Gmail's limit (~35 MB) means users
  *will* hit the difference.
- **[ADDED]** Undo-send parity: Gmail compose honors a `cancelWindow` preference;
  Graph has no recall. Keep the existing client-side delay behavior
  provider-neutral so the UX matches.
- Scheduled send: provider-aware `sendRawMessage` in the scheduler as drafted
  (resolve provider by `accountId`). Note the queue contract must already be fixed
  (Phase 0). Optional v2: Graph native deferred send via
  `PidTagDeferredSendTime` (0x3FEF) extended property on a draft.

## Phase 9: Mutations

As drafted (PATCH `isRead`; PATCH `flag.flagStatus`; moves for archive/trash/
untrash; folder CRUD for `folder:<id>` labels), with:

- **[AMENDED — A11]** Archive resolves **only** via the `archive` well-known name.
  Drop the "resolve folder by display name `Archive`" fallback — display names are
  localized and will mis-resolve on non-English mailboxes. If the well-known folder
  is genuinely absent (rare on Exchange Online), surface an error.
- **[A1 reminder]** Moves are exactly why immutable ids are non-negotiable: with
  them, archive/trash keep message identity; without them every mutation in this
  phase corrupts the cache.
- Thread-level read/unread applies per cached message of the conversation
  (as drafted) — batch via `$batch` (A9).

## Phase 10: Delta Sync

As drafted (per-folder `MicrosoftDeltaState` in IndexedDB — `accountId`, `folderId`,
`deltaLink`, `lastSyncedAt`; initial sync loop on `nextLink` → save `deltaLink`;
incremental with `@removed` handling; error recovery: 410 → reset folder state,
429 → `Retry-After`, 5xx → keep state, auth failure → mark expired).

The localStorage watermark scheme this replaces is keyed by accountId only —
verified insufficient (`src/renderer/app/lib/db/outlookWatermark.ts`,
`outlook:history:watermark:<accountId>`); keep it solely as removable migration/
debug code, as drafted.

- **[AMENDED — A5]** Tracked folders v1: Inbox, Sent Items, Deleted Items,
  Junk Email, Archive. **Drafts is excluded.** The draft plan synced the Drafts
  folder while no phase implements editing server drafts — users would see
  Microsoft drafts they cannot open. Explicit v1 policy: Microsoft compose drafts
  are **local-only** (IndexedDB, like today's compose flow); server drafts are not
  listed. Server-draft sync (via `createReply` etc., with its own quirks —
  pre-filled quote bodies, id changes on send) is a v2 feature.
- Custom folder delta on first view, then kept in the tracked set (as drafted).
- Cursor note: `@odata.deltaLink` is reused (not consumed) between syncs; only
  replace it when a new one is returned.

## Phase 11: New-Mail Delivery — Delta Poller (v1), Push Relay (v2)

**[AMENDED — A3] This phase is restructured.**

### Why

1. Graph subscriptions need a public HTTPS `notificationUrl` (validation echo
   within 10 s; 2xx within 3 s on delivery) — impossible from a desktop app,
   mandatory hosted infrastructure for an open-source desktop client.
2. The WS scaffold is dead code in the working tree:
   `WebSocketPushClient.getInstance()` is never called in `src/main`;
   `app-events/index.ts:106` starts only `schedulerService`. `GmailHistoryPoller`
   (the standalone Gmail delivery path) is deleted. **No provider currently has
   live new-mail delivery.** (The grep-based conclusion is robust, but this
   working tree carries uncommitted WIP — re-verify exact line numbers at edit
   time rather than trusting the ones recorded here.)

### v1: provider-neutral delta poller (main process)

Resurrect the deleted poller pattern (`git show HEAD:src/main/services/push/GmailHistoryPoller.ts`
— 276 lines: per-account interval, backoff, dispatch into the existing push-frame
pipeline) generalized to `MailDeltaPoller`:

- Google accounts: `history.list` from the stored `historyId` (restores the deleted
  Gmail behavior).
- Microsoft accounts: Inbox-folder delta (Phase 10 state) on the same cadence.
- Cadence: ~60 s foreground, backoff when throttled (429/`Retry-After`), pause on
  `powerMonitor` suspend, immediate poll on resume and window focus.
- Output: synthesize the existing push-frame shapes (`MESSAGE_ADDED`,
  `MESSAGE_DELETED`, label-change frames) so `MessageContext` and the notification
  pipeline consume them unchanged. Gmail-specific frame normalization
  (`normalizeGmailLabels` in `MessageContext.tsx`) receives already-normalized
  labels from the Microsoft path (Phase 5 mapping).

### v2: Graph push relay

The draft's relay design (desktop creates subscriptions with its own Graph token;
relay validates `clientState`, maps `subscriptionId` → WS session, forwards a
lightweight `MICROSOFT_MAIL_CHANGED` event; never holds refresh tokens or mailbox
content) is sound. Carry it to v2 with corrections:

- **[ADDED]** Set `lifecycleNotificationUrl` **at subscription creation** — it
  cannot be added by PATCH later. Handle `reauthorizationRequired` (PATCH to
  reauthorize+renew), `subscriptionRemoved`, and `missed` (trigger delta
  reconciliation); ack lifecycle posts with 202.
- Expiration: message subscriptions max **10,080 min (~7 days)** plain. Renew well
  before expiry (daily is comfortable); recreate on 404.
- Webhooks are a *hint*; the delta poller (demoted to a slow reconciliation loop)
  remains the source of truth. Folder moves and read/flag changes all arrive as
  `updated` — diff via delta, don't interpret the notification payload.
- Plain notifications only (no `includeResourceData`; rich notifications add an
  encryption-certificate requirement for no benefit here).
- Limits: 1,000 active subscriptions per mailbox; 500 subscription writes / 20 s /
  app / tenant — stagger renewals.

## Phase 12: Notifications

As drafted (on new mail: delta sync → native notification for new Inbox unread;
metadata `{ uid, threadId, provider:'microsoft' }`; click-through reuses the
existing flow), with verified touchpoints:

- The per-account notification preference defaults to the literal Gmail `'INBOX'`
  label (`src/main/services/ipc-handlers/notification/index.ts:54,57`); Microsoft
  Inbox mail must carry the normalized `INBOX` label (Phase 5) for the existing
  preference check to work. `PRIMARY` is treated as `INBOX` for Microsoft
  (as drafted — there are no Gmail category tabs to distinguish).
- The trigger pipeline depends on Phase 11's poller frames; nothing fires today
  (see A3 evidence).
- **[ADDED — A8]** Notification avatars/sender photos must not call the People API
  for Microsoft accounts (see Phase 14).

## Phase 13: UI Updates

As drafted (Sign-in buttons per configured client ID with a config-error state when
neither exists; "Add Microsoft 365 account" in `IntegrationForm` calling the direct
OAuth IPC; account-status scope checks per provider; existing Outlook icon for
`provider==='microsoft'`; unified inbox includes both providers; Gmail category nav
Google-only; Microsoft custom folders in the sidebar; search translator decides
support, local fallback otherwise).

Verified specifics:

- `SignInLayout.tsx` gates on `MONO_ENV_GOOGLE_CLIENT_ID` and calls
  `electronApi.initiateSignIn()` — add the Microsoft branch.
- `OnBoardingAddAccounts.tsx:43-51` — flip the Outlook tile `supported:false` →
  `true` and route by `providerId`.
- **[A13 reminder]** The category/label-name sweep (`MailNavTabs.tsx:17`,
  `convertToAccurateQuery.ts:7`, `customSearch.ts:544`, `useThreadLabels.ts`)
  lands in this phase's verification pass: every place that renders or filters by
  Gmail names must handle the normalized Microsoft equivalents or hide itself for
  Microsoft accounts.

## Phase 14: Calendar and Contacts Boundaries

As drafted: no Outlook Calendar, no Microsoft contacts autocomplete in v1;
People-API calls remain Google-only; recipient avatars for Microsoft use profile
photo when available, initials otherwise.

- **[AMENDED — A8]** "Remain Google-only" requires *active gating*, not omission —
  the call sites fire for **any** uid and the token resolution **throws** for
  non-Google uids (`TokenManager.ts:292`), it does not degrade:
  - `src/renderer/app/components/ui/recipient-avatar.tsx:68-74` —
    `electronApi.peopleRequest` (`/people:searchContacts`, `/otherContacts:search`);
  - `src/renderer/app/hooks/useOwnAvatarUrl.ts:44` — own avatar via People photos;
  - handler `src/main/services/ipc-handlers/gmail/index.ts:154,164` resolves via
    `getGoogleAccountAccessToken(uid)`.
  Add provider guards at both renderer call sites (Microsoft: own avatar from
  `/me/photo/$value` captured at sign-in; recipients: initials).
- Verified moot/fine, for the record: signatures already work standalone and
  provider-agnostic (`src/main/api/signature/signatureApi.ts` stores to
  localStorage — no backend, no provider coupling; zero Outlook work needed).
  There is no send-as/alias UI at all (from-address resolves via
  `getUidFromEmail(draft.from)`, `AuthContext.tsx:252`), so Graph's admin-gated
  alias model imposes no v1 work. No AI-compose features exist on this branch.
- Future contacts scope: `People.Read` / `Contacts.Read` — not in v1.

## Phase 15: Docs, Configuration, and Distribution

As drafted (`docs/MICROSOFT_OAUTH_SETUP.md`, update `GETTING_STARTED.md`,
`.env.example`), plus:

- **[AMENDED — A6] Start publisher verification at Phase 1, not here.** Since the
  Nov 8 2020 policy, users in org tenants **cannot consent to unverified
  multitenant apps** requesting anything beyond basic sign-in — and work/school
  tenants are exactly this plan's v1 audience. Verification requires a Microsoft
  AI Cloud Partner Program (CPP/MPN) account as Partner Global Account, a
  DNS-verified publisher domain (not `*.onmicrosoft.com`), and an MFA-verified
  authorizer — weeks of calendar time, zero code. The setup doc must cover the
  per-tenant **admin-consent** escape hatch for tenants that block user consent,
  and the open-source reality of shipping a client ID (precedent: Thunderbird
  ships one verified public client ID). **Tracking**: outside the engineering
  critical path but a **release blocker** with a named owner. Acceptance
  criterion: "verified publisher" badge visible on the consent screen, **or**
  documented tenant admin-consent setup shipped for internal deployments.
- Setup doc contents as drafted (Entra registration, work/school account types,
  loopback redirect URI for a public client / `allowPublicClient`, delegated
  permissions `User.Read, Mail.ReadWrite, Mail.Send, offline_access, openid,
  email, profile`).
- Relay endpoints move to the v2 docs (A3).

## Carried items from phase reviews

Adversarially-reviewed-but-deferred nits to pick up in later phases:

- `persist()` swallows write failures (`TokenManager.ts`) — pre-existing, but RT
  rotation raises the stakes: a failed disk write after a Microsoft refresh
  strands the account on restart. Consider surfacing persist failures
  post-rotation. (Phase 2/16)
- Legacy account entries are migrated verbatim without field validation —
  add per-entry validation or drop malformed entries. (Phase 16 test target)
- `removeGoogleAccount` wrapper removes any-provider account by uid — gate or
  migrate the IPC when `IntegrationForm` gains Microsoft accounts. (Phase 13)
- No automated tests cover the googleAccounts→mailAccounts migration, JSON
  round-trip, or Microsoft RT rotation persistence. (Phase 16)
- Reminder `messageId` is dropped by the IPC handler/SchedulerService —
  harmless today. (Phase 0 review nit)
- A Microsoft-primary session installs the Graph access token as the backend
  API bearer + push-WS token (pre-existing token-changed bridge design;
  matters once a backend coexists with Microsoft sessions). (Phase 4/11)
- Both OAuth servers can run flows concurrently — last `saveTokens` wins the
  session; gate the sign-in buttons or add a cross-provider in-flight guard.
  Both buttons also share one `isLoading` flag. (Phase 13)
- `useOwnAvatarUrl` fires a doomed Google People IPC for photo-less Microsoft
  accounts — covered by the A8 gating work. (Phase 14)
- Sign-out discards but never revokes refresh tokens server-side (both
  providers, pre-existing pattern). (hardening backlog)
- OAuth loopback `/callback` handles `?error=` before `state` validation —
  local-process flow-abort only, matches the Google template. (hardening
  backlog)

Phase 4 (Graph IPC + client) review nits:

- The worker→host Graph bridge routes every request through the main-process
  `net.fetch` (no CORS), so the `onHeadersReceived` CORS-injection allow-list
  (`app-events/index.ts:119`) is **not** extended to `graph.microsoft.com`. If a
  future worker ever fetches Graph directly (bypassing the host bridge) it would
  be CORS-blocked — add graph there if that path appears. (Phase 6/11)
- `main:graph:batch` forwards each subrequest `url` verbatim into the `$batch`
  envelope without validating it is version-relative — a non-relative/absolute
  url just fails server-side. Consider a relative-path guard mirroring
  `buildGraphUrl`. (Phase 6 hardening)
- `graphBatch()` takes no `AbortSignal` (the single-request path does, via
  `withAbort`). Wire cancellation when Phase 6 hydration needs it. (Phase 6)
- No automated coverage yet asserts the immutable-id `Prefer` header is present
  on every Graph request (single + each batch subrequest) or that delta-link
  origin validation rejects non-graph hosts. (A1/A9 → Phase 16 test targets)

Phase 5 (A2 id-heuristic + Graph data mapping) review nits:

- **A2 audit list was incomplete.** The audit cited 3 `id.length < 20` sites;
  the real functional set was 5 (`db/draft`, `db/thread`, `store/useDraftAtom`,
  `commands/threadCommands`, `header/DisplayPanelHeader`) plus a stale comment in
  `ThreadItemContextMenu`. All now use `isComposeDraftId`. Consider a lint guard
  against reintroducing `id.length < 20` for id classification. (Phase 16)
- `transformGraphThread` applies a single `folderLabel` to every message in a
  conversation. Cross-folder threads (e.g. SENT + INBOX) need per-message folder
  resolution at the adapter, not the transform. (Phase 6/10)
- The display payload uses the full Graph `body` (so the existing quoted-history
  extraction runs, matching Gmail). `uniqueBody` is intentionally deferred to the
  reply-composition path. (Phase 8)
- `bodyHtml`/`bodyPlain` are set on the mapped message, but the renderer reads
  the synthetic `payload`; the direct fields are for non-render consumers.
- `utf8ToBase64Url` relies on `btoa`/`TextEncoder` (present in renderer/worker,
  Node 16+); guard if the transform is ever invoked in an older main context.
- No automated coverage yet for the transforms: synthetic-payload round-trip
  through `parsePayloadPart`, label/folder mapping, inline-image cid mapping, and
  that the primary key is the Graph immutable id. (Phase 16 test targets)

Phase 3 (adapter seam) done; Phase 6 (un-gate + A13 sweep) carried:

- **The Phase 2 gate is still in place — Microsoft accounts do not sync yet.**
  The adapter (`mailApi` → `getProviderForUid` → google/microsoftMailProvider)
  and the Microsoft read paths are wired but dormant.
- **Un-gating is non-trivial.** `getLimitedAccountUids`
  (`useThreadFetchHandler.tsx:118`) filters to `provider === 'google'` and feeds
  **8 call sites** that drive *both* thread fetch (now adapter-backed, safe for
  Microsoft) *and* Gmail `historyId` sync (Google-only until Phase 10/11 delta).
  The un-gate must split "fetchable" (all providers) from "Gmail-history-
  syncable" (Google only) per call site — not just delete the filter — and
  handle the `historySyncWorker` `provider === 'microsoft'` branch
  (`historySyncWorker.ts:142`). Doing it wrong flips the shared `loadingStatus`
  atom into a sticky ERROR or freezes the inbox.
- **A13 is smaller than feared** because Phase 5 emits *normalized* labels
  (INBOX/SENT/UNREAD/STARRED…), so label-filter consumers already work. The real
  remaining leak is the Gmail **query-string builders** (`convertToAccurateQuery`,
  `customSearch`); `microsoftMailProvider.translateQuery` is only a v1 cut
  (folder + is:unread/is:starred). Full search translation is the Phase 6/13 item.
- **microsoftMailProvider read paths are unvalidated against a live tenant.**
  No automated coverage; needs the Phase 16/A14 M365 sandbox before un-gating
  ships, since un-gating changes the live primary-inbox behavior for anyone with
  a Microsoft account connected.
- `getThread` filters by `conversationId` with no `$orderby` (Graph's sort-
  complexity guard); `transformGraphThread` sorts client-side. List items carry
  empty body payloads until `getThread`/`getMessage` hydrate them (parity with
  Gmail's metadata list). (Phase 6)

Phase 7/9/8 (Microsoft attachments, mutations, send) — done (dormant) + carried:

- microsoftMailProvider now implements 11/19 adapter methods (read, attachments,
  mutations, send). Still stubbed: `getHistoryList` (intentional — Microsoft uses
  delta, not historyId; Phase 10/11), `getLabels`/label CRUD (folders+categories,
  belongs with Phase 13 UI), and `get/postMessageUnsubscribe` (edge feature).
- **Send returns no message id** (Graph sendMail is 202/no-body); the sent
  message appears via Sent Items sync. The ~4 MB encoded-MIME guard is
  conservative — verify the real ceiling against a sandbox before raising, and
  the large-attachment draft+upload-session path is v1.5. (Phase 8/16)
- **Scheduled send is not yet provider-aware.** Phase 8 calls for a provider-aware
  `sendRawMessage` in the scheduler (resolve provider by accountId); the
  SchedulerService send path still assumes Gmail. (Phase 8 follow-up)
- Mutations do N fetches (one `getConversationMessageIds` per thread) before
  batching; fine for small selections, could be consolidated. Untrash always
  restores to Inbox (Graph has no "previous folder"); acceptable v1.
- All of the above is dormant behind the Phase 2 gate and **unvalidated against a
  live tenant** — needs the Phase 16/A14 sandbox.

## Phase 16: Testing

As drafted (typecheck; token-migration, OAuth-URL, Graph-IPC validation, transform,
query-translation, and delta-sync unit suites; integration via mocked Graph;
manual acceptance list), plus:

- **[ADDED — A2]** Regression tests for the id-heuristic fixes: a ~150-char Graph
  conversation id must never be classified as a compose UUID
  (`draft/index.ts:34`, `useDraftAtom.ts:326`) nor enter the historyId bootstrap
  (`thread/index.ts:578`).
- **[ADDED — A1]** Transform/mutation tests assert `Prefer: IdType="ImmutableId"`
  is present on every Graph request, and that a move (archive) preserves the
  cached message identity.
- **[ADDED — A4]** Send tests: MIME > 4 MB is rejected with the user-facing error
  (or routed to the upload-session path if implemented).
- **[ADDED — A14]** Test/dev infrastructure decisions the draft leaves open:
  - a **Graph fixture server** (recorded/canned Graph responses) for integration
    tests — the existing mock backend cannot play this role (it is backend-contract
    shaped, `provider:'google'`-only, and not on the standalone auth path);
  - a **Microsoft 365 Developer Program sandbox tenant** for manual acceptance —
    work/school behavior (admin consent, folder semantics) cannot be validated
    against personal accounts.
- Poller tests (Phase 11 v1): new-message frame synthesis from a delta page;
  backoff on 429; resume-from-suspend triggers an immediate poll.

## Implementation Order (revised)

1. Phase 0 — fix the 4 typecheck errors + queue contract decision.
2. Provider-neutral account/token model with Google compatibility (+ **start
   publisher verification in parallel** — A6).
3. Microsoft OAuth (loopback PKCE) + account hydration + CSP/validChannels (A7).
4. Graph IPC with unconditional immutable-ID header (A1) + `$batch` helper (A9).
5. Id-heuristic fixes (A2) — **before** any Microsoft message enters the store.
6. Graph transforms + adapter read-only thread/message fetch.
7. Unified inbox list/detail for Microsoft (+ label-leakage sweep — A13).
8. Mutations: read/unread, flag, archive/delete, folders (A11).
9. Send/reply via Graph `sendMail` MIME + 4 MB guard (A4).
10. Attachments + inline images.
11. Per-folder delta state replacing the watermark scaffolding (A5: no Drafts).
12. **Delta poller for both providers** (restores Gmail delivery too — A3).
13. Notifications + People-API gating (A8).
14. UI, docs, tests.
15. Full typecheck + automated suites.
16. Manual end-to-end with an M365 sandbox tenant (A14).

v2 backlog: push relay (with lifecycle notifications), server-draft sync,
upload-session large attachments (if not in v1), RFC 5322-based thread regrouping,
Outlook Calendar, Microsoft contacts autocomplete, native deferred send
(`PidTagDeferredSendTime`).

## Explicit Non-Goals for V1

As drafted, plus the push relay (moved to v2) and server-side Microsoft drafts:

- Personal Outlook/Hotmail (MSA) accounts.
- Outlook Calendar; Microsoft contacts autocomplete.
- Server-draft sync / editing Microsoft drafts created elsewhere.
- Graph category management beyond display/mapping.
- Push relay backend (v2) and any server-side mailbox reads.
- Cross-provider identical advanced search semantics.
- Send-as / alias support (no existing UI; Graph alias model is admin-gated).
- Rewriting the UI around provider-specific sections.
