export const ellipsisEmailString = (email: string, maxLength = 50) => {
  if (!email || typeof email !== 'string') return '';

  const parts = email.split('@');
  if (parts.length !== 2) return email;

  const [username, domain] = parts;
  const truncate = (str: string, max: number) =>
    str.length > max
      ? `${str.slice(0, Math.floor(max / 2))}...${str.slice(-Math.floor(max / 2))}`
      : str;

  const truncatedUsername = truncate(username, maxLength / 2);
  const truncatedDomain = truncate(domain, maxLength / 2);

  return `${truncatedUsername}@${truncatedDomain}`;
};

export const ellipsisString = (text: string, maxLength = 100) => {
  if (!text || typeof text !== 'string') return '';

  if (text.length <= maxLength) return text;

  const halfLength = Math.floor(maxLength / 2);
  return `${text.slice(0, halfLength)}...${text.slice(-halfLength)}`;
};
