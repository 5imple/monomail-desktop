export function compareVersions(v1: string, v2: string): boolean {
  const parseVersion = (version: string) => {
    const [main, channel] = version.split('-');
    const [major, minor, patch] = main.split('.').map(Number);
    return { major, minor, patch, channel: channel || 'latest' };
  };

  const channelPriority = { dev: 2, beta: 1, latest: 0 };

  const v1Parsed = parseVersion(v1);
  const v2Parsed = parseVersion(v2);

  const v1Priority = channelPriority[v1Parsed.channel];
  const v2Priority = channelPriority[v2Parsed.channel];

  if (v1Parsed.channel === 'latest' && v2Parsed.channel !== 'latest') {
    return false;
  }

  // For 'beta', allow updates from 'beta' or 'latest' versions
  if (v1Parsed.channel === 'beta' && v2Priority < v1Priority) {
    return false;
  }

  if (v1Parsed.major !== v2Parsed.major) {
    return v1Parsed.major > v2Parsed.major;
  }

  if (v1Parsed.minor !== v2Parsed.minor) {
    return v1Parsed.minor > v2Parsed.minor;
  }

  if (v1Parsed.patch !== v2Parsed.patch) {
    return v1Parsed.patch > v2Parsed.patch;
  }
  return false;
}
