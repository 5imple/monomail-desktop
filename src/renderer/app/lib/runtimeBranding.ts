/** Values from env — no product-specific defaults in source. */

export function getSupportEmail(): string {
  return import.meta.env.MONO_ENV_SUPPORT_EMAIL?.trim() || 'support@example.com';
}

export function getSocialXUrl(): string {
  return import.meta.env.MONO_ENV_SOCIAL_X_URL?.trim() || '';
}

export function getDiscordInviteUrl(): string {
  return import.meta.env.MONO_ENV_DISCORD_INVITE_URL?.trim() || '';
}

export function getBrandEmailDomainForFavicon(): string {
  return import.meta.env.MONO_ENV_BRAND_EMAIL_DOMAIN?.trim() || '';
}

export function getShareCookieDomain(): string {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'localhost';
  }
  const explicit = import.meta.env.MONO_ENV_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit;
  try {
    const host = new URL(import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN).hostname;
    if (!host) return 'localhost';
    const parts = host.split('.');
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join('.')}`;
    }
    return `.${host}`;
  } catch {
    return 'localhost';
  }
}

export function getUtmSource(): string {
  return import.meta.env.MONO_ENV_UTM_SOURCE?.trim() || 'app';
}
