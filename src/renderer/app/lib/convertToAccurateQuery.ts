import { SplitCategoryPreferences } from '@/main/api/auth/types';

export const convertToAccurateQuery = (
  query: string,
  categoryPreferences: SplitCategoryPreferences
) => {
  if (query === 'category:primary') {
    // Build the exclusion parts based on user preferences
    // Only exclude categories that are set to true (meaning they should be split out from Primary)
    const exclusions: string[] = [];

    if (!categoryPreferences.showSocial) {
      exclusions.push('-category:social');
    }

    if (!categoryPreferences.showPromotions) {
      exclusions.push('-category:promotions');
    }

    if (!categoryPreferences.showUpdates) {
      exclusions.push('-category:updates');
    }

    if (!categoryPreferences.showForums) {
      exclusions.push('-category:forums');
    }

    // Always exclude github.com emails from Primary (matching isPrimaryThread logic)
    exclusions.push('-from:"github.com"');

    // Construct the query: include INBOX and exclude the categories that should be split out
    const exclusionQuery = exclusions.length > 0 ? ` AND ${exclusions.join(' AND ')}` : '';
    return `label:INBOX${exclusionQuery}`;
  }
  return query;
};
