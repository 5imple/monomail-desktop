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
    const faviconUrl = `https://logo.clearbit.com/${extractDomainFromEmail(email)}`;
    return faviconUrl;
  }
};
