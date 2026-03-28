import { extractSearchTerms } from './highlightThreadText';

export interface SearchSuggestion {
  id: string;
  query: string;
  description: string;
  type: 'operator' | 'smart' | 'recent' | 'suggestion';
  category?: string;
  score?: number;
}

/**
 * Generate intelligent search suggestions based on current query and context
 */
export function generateSearchSuggestions(
  currentQuery: string,
  recentQueries: string[] = [],
  contactEmails: string[] = []
): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];
  const queryLower = currentQuery.toLowerCase().trim();

  // If query is empty, show recent searches and popular operators
  if (!queryLower) {
    // Add recent searches
    recentQueries.slice(0, 3).forEach((query, index) => {
      suggestions.push({
        id: `recent-${index}`,
        query,
        description: `Recent search: ${query}`,
        type: 'recent'
      });
    });

    // Add popular operators
    const popularOperators = [
      { op: 'from:', desc: 'Search emails from specific senders' },
      { op: 'subject:', desc: 'Search by subject line' },
      { op: 'has:attachment', desc: 'Find emails with attachments' },
      { op: 'is:unread', desc: 'Show unread emails' },
      { op: 'is:starred', desc: 'Show starred emails' }
    ];

    popularOperators.forEach((operator, index) => {
      suggestions.push({
        id: `popular-${index}`,
        query: operator.op,
        description: operator.desc,
        type: 'operator',
        category: 'Popular'
      });
    });

    return suggestions;
  }

  // Smart suggestions based on current query
  const terms = extractSearchTerms(currentQuery);
  const hasOperators = /(-?)(from|to|subject|cc|bcc|label|has|is|in):/i.test(currentQuery);

  // If user is typing an operator, suggest completions
  if (queryLower.endsWith(':') && !queryLower.includes(' ')) {
    const operator = queryLower.slice(0, -1);
    const operatorSuggestions = getOperatorSuggestions(operator, contactEmails);
    suggestions.push(...operatorSuggestions);
  }

  // If query has search terms but no operators, suggest adding operators
  if (terms.length > 0 && !hasOperators) {
    suggestions.push({
      id: 'add-from',
      query: `from:${queryLower}`,
      description: `Search for emails from "${queryLower}"`,
      type: 'smart',
      category: 'Add filters'
    });

    suggestions.push({
      id: 'add-subject',
      query: `subject:${queryLower}`,
      description: `Search in subject: "${queryLower}"`,
      type: 'smart',
      category: 'Add filters'
    });

    suggestions.push({
      id: 'add-attachment',
      query: `${queryLower} has:attachment`,
      description: `"${queryLower}" with attachments`,
      type: 'smart',
      category: 'Add filters'
    });
  }

  // If query looks like an email, suggest from: operator
  if (isEmailLike(queryLower)) {
    suggestions.push({
      id: 'email-from',
      query: `from:${queryLower}`,
      description: `Emails from ${queryLower}`,
      type: 'smart',
      category: 'Email suggestions'
    });

    suggestions.push({
      id: 'email-to',
      query: `to:${queryLower}`,
      description: `Emails to ${queryLower}`,
      type: 'smart',
      category: 'Email suggestions'
    });
  }

  // Smart time-based suggestions
  if (terms.some((term) => ['today', 'yesterday', 'week', 'month'].includes(term.toLowerCase()))) {
    const timeWord = terms.find((term) =>
      ['today', 'yesterday', 'week', 'month'].includes(term.toLowerCase())
    );
    if (timeWord) {
      const timeQuery = getTimeQuery(timeWord.toLowerCase());
      if (timeQuery) {
        suggestions.push({
          id: 'time-filter',
          query: `${currentQuery.replace(timeWord, '').trim()} ${timeQuery}`.trim(),
          description: `Add time filter for ${timeWord}`,
          type: 'smart',
          category: 'Time filters'
        });
      }
    }
  }

  // Domain-based suggestions
  const domain = extractDomain(queryLower);
  if (domain) {
    suggestions.push({
      id: 'domain-from',
      query: `from:*@${domain}`,
      description: `All emails from ${domain}`,
      type: 'smart',
      category: 'Domain suggestions'
    });
  }

  return suggestions.slice(0, 8); // Limit to 8 suggestions
}

/**
 * Get suggestions for specific operators
 */
function getOperatorSuggestions(operator: string, contactEmails: string[]): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];

  switch (operator.toLowerCase()) {
    case 'from':
    case 'to':
    case 'cc':
    case 'bcc':
      // Suggest recent contacts
      contactEmails.slice(0, 5).forEach((email, index) => {
        suggestions.push({
          id: `contact-${index}`,
          query: `${operator}:${email}`,
          description: `${operator} ${email}`,
          type: 'suggestion',
          category: 'Contacts'
        });
      });
      break;

    case 'label':
      // Common label suggestions
      const commonLabels = ['important', 'work', 'personal', 'urgent'];
      commonLabels.forEach((label, index) => {
        suggestions.push({
          id: `label-${index}`,
          query: `label:${label}`,
          description: `Messages labeled "${label}"`,
          type: 'suggestion',
          category: 'Labels'
        });
      });
      break;

    case 'has':
      const hasOptions = [
        { value: 'attachment', desc: 'Messages with attachments' },
        { value: 'drive', desc: 'Messages with Google Drive files' },
        { value: 'document', desc: 'Messages with Google Docs' },
        { value: 'spreadsheet', desc: 'Messages with Google Sheets' }
      ];
      hasOptions.forEach((option, index) => {
        suggestions.push({
          id: `has-${index}`,
          query: `has:${option.value}`,
          description: option.desc,
          type: 'suggestion',
          category: 'Content types'
        });
      });
      break;

    case 'is':
      const isOptions = [
        { value: 'unread', desc: 'Unread messages' },
        { value: 'starred', desc: 'Starred messages' },
        { value: 'important', desc: 'Important messages' },
        { value: 'snoozed', desc: 'Snoozed messages' }
      ];
      isOptions.forEach((option, index) => {
        suggestions.push({
          id: `is-${index}`,
          query: `is:${option.value}`,
          description: option.desc,
          type: 'suggestion',
          category: 'Message states'
        });
      });
      break;

    case 'in':
      const inOptions = [
        { value: 'inbox', desc: 'Messages in inbox' },
        { value: 'sent', desc: 'Sent messages' },
        { value: 'draft', desc: 'Draft messages' },
        { value: 'spam', desc: 'Messages in spam' },
        { value: 'trash', desc: 'Messages in trash' }
      ];
      inOptions.forEach((option, index) => {
        suggestions.push({
          id: `in-${index}`,
          query: `in:${option.value}`,
          description: option.desc,
          type: 'suggestion',
          category: 'Folders'
        });
      });
      break;
  }

  return suggestions;
}

/**
 * Check if a string looks like an email address
 */
function isEmailLike(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) || str.includes('@');
}

/**
 * Extract domain from email-like string
 */
function extractDomain(str: string): string | null {
  const match = str.match(/@([^\s@]+\.[^\s@]+)/);
  return match ? match[1] : null;
}

/**
 * Convert time words to Gmail search syntax
 */
function getTimeQuery(timeWord: string): string | null {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  switch (timeWord) {
    case 'today':
      return `after:${formatDate(today)}`;
    case 'yesterday':
      return `after:${formatDate(yesterday)} before:${formatDate(today)}`;
    case 'week':
      const weekAgo = new Date(today);
      weekAgo.setDate(today.getDate() - 7);
      return `after:${formatDate(weekAgo)}`;
    case 'month':
      const monthAgo = new Date(today);
      monthAgo.setMonth(today.getMonth() - 1);
      return `after:${formatDate(monthAgo)}`;
    default:
      return null;
  }
}

/**
 * Score search suggestions based on relevance to current query
 */
export function scoreSearchSuggestions(
  suggestions: SearchSuggestion[],
  currentQuery: string
): SearchSuggestion[] {
  const queryLower = currentQuery.toLowerCase();

  return suggestions
    .map((suggestion) => ({
      ...suggestion,
      score: calculateSuggestionScore(suggestion, queryLower)
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * Calculate relevance score for a suggestion
 */
function calculateSuggestionScore(suggestion: SearchSuggestion, query: string): number {
  let score = 0;

  // Base scores by type
  switch (suggestion.type) {
    case 'smart':
      score += 100;
      break;
    case 'recent':
      score += 80;
      break;
    case 'operator':
      score += 60;
      break;
    case 'suggestion':
      score += 40;
      break;
  }

  // Bonus for query similarity
  if (suggestion.query.toLowerCase().includes(query)) {
    score += 50;
  }

  if (suggestion.description.toLowerCase().includes(query)) {
    score += 20;
  }

  // Penalty for very long suggestions
  if (suggestion.query.length > 50) {
    score -= 10;
  }

  return score;
}
