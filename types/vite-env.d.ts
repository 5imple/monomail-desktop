/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MONO_ENV_FIREBASE_API_KEY: string;
  readonly MONO_ENV_FIREBASE_AUTH_DOMAIN: string;
  readonly MONO_ENV_FIREBASE_PROJECT_ID: string;
  readonly MONO_ENV_FIREBASE_STORAGE_BUCKET: string;
  readonly MONO_ENV_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly MONO_ENV_FIREBASE_APP_ID: string;
  readonly MONO_ENV_FIREBASE_MEASUREMENT_ID: string;
  readonly MONO_ENV_FIREBASE_VAPID_KEY: string;
  readonly MONO_ENV_HOMEPAGE_DOMAIN: string;
  readonly MONO_ENV_API_URL: string;
  readonly MONO_ENV_APP_VERSION: string;
  readonly MONO_ENV_MIXPANEL_TOKEN: string;
  readonly MONO_ENV_PROTOCOL: string;
  /** Shown in UI; mailto targets, notifications, etc. */
  readonly MONO_ENV_SUPPORT_EMAIL: string;
  /** Origin only, e.g. https://your-store.lemonsqueezy.com — `/buy/{variantId}` is appended */
  readonly MONO_ENV_BILLING_CHECKOUT_BASE_URL: string;
  /** Cookie `domain=` for link-share sign-in return (e.g. `.example.com`). Optional; derived from homepage if empty. */
  readonly MONO_ENV_COOKIE_DOMAIN: string;
  /** UTM source for marketing links (default `app`) */
  readonly MONO_ENV_UTM_SOURCE: string;
  /** Optional hiring page URL for dev console banner */
  readonly MONO_ENV_CAREERS_URL: string;
  /** If the user email contains this domain, favicon uses your API route (optional) */
  readonly MONO_ENV_BRAND_EMAIL_DOMAIN: string;
  readonly MONO_ENV_SOCIAL_X_URL: string;
  readonly MONO_ENV_DISCORD_INVITE_URL: string;

  /**
   * Origin of the on-prem backend (e.g. https://api.example.com). Used for
   * endpoints that used to live on Firebase Cloud Functions: NPS, billing,
   * etc. Defaults to MONO_ENV_API_URL when unset, since most deployments
   * will collocate the legacy "/api/v1" surface and the previously-Functions
   * routes behind the same origin.
   */
  readonly MONO_ENV_BACKEND_URL: string;

  /**
   * URL of the electron-updater feed (e.g. https://updates.example.com/mac/).
   * Should serve `latest-mac.yml` + the .zip/.dmg artifacts. Replaces the
   * previous Firebase Storage layout.
   */
  readonly MONO_ENV_UPDATE_FEED_URL: string;

  /**
   * Public-facing domain used in share links and public URLs (e.g.
   * https://example.com). Previously derived from MONO_ENV_FIREBASE_AUTH_DOMAIN;
   * split out so Firebase can be removed without changing the share UX.
   */
  readonly MONO_ENV_PUBLIC_DOMAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
