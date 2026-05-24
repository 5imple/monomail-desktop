export const generalEmailDomains = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'aol.com',
  'icloud.com',
  'mail.com',
  'yandex.com'
];

// Function to extract the main domain from an email
export const extractDomainFromEmail = (email: string): string => {
  const emailRegex = /@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
  const match = email.match(emailRegex);
  if (match) {
    const domainParts = match[1].split('.');
    // Registrable-style domain (last two labels)
    return domainParts.slice(-2).join('.');
  }
  return '';
};

// Function to get the favicon from the domain
export const getFaviconFromDomain = (domain: string): string => {
  const faviconUrl = `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/api/favicon?domain=${domain}`;
  return faviconUrl;
};

// Function to get the favicon from the domain
export const getFaviconFromEmail = (email: string): string => {
  const brandDomain = import.meta.env.MONO_ENV_BRAND_EMAIL_DOMAIN?.trim();
  if (
    email.includes('meta.com') ||
    email.includes('apple') ||
    (brandDomain && email.includes(brandDomain)) ||
    email.includes('google.com') ||
    email.includes('gmail.com')
  ) {
    const faviconUrl = `${import.meta.env.MONO_ENV_HOMEPAGE_DOMAIN}/api/favicon?email=${email}`;
    return faviconUrl;
  } else {
    // Clearbit's free logo API was sunset, so logo.clearbit.com no longer resolves.
    // Google's favicon service resolves in both dev and prod with no backend.
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${extractDomainFromEmail(email)}&sz=128`;
    return faviconUrl;
  }
};
