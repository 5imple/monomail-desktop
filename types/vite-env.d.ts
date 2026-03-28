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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
