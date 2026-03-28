/**
 * Highlight search terms in thread list text (subject or snippet)
 * @param {string} text - The text to highlight
 * @param {string} searchQuery - The search query string
 * @returns {string} - HTML with highlighted search terms
 */
export function highlightThreadText(text: string, searchQuery: string): string {
  if (!searchQuery || !text) return text;

  // Extract search terms from the query
  const searchTerms = extractSearchTerms(searchQuery);
  let highlightedText = text;

  for (const term of searchTerms) {
    if (term.length < 2) continue; // Skip very short terms

    // Escape special regex characters in the search term
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create a case-insensitive regex
    const regex = new RegExp(`(${escapedTerm})`, 'gi');

    // Replace with highlighted version - using specific class for thread list
    highlightedText = highlightedText.replace(
      regex,
      '<span class="bg-amber-300 dark:bg-yellow-80 text-black rounded-sm select-text">$1</span>'
    );
  }

  return highlightedText;
}

/**
 * Extract search terms from a query string, respecting quotes for phrases
 * @param {string} query - The search query
 * @returns {string[]} - Array of search terms
 */
export function extractSearchTerms(query: string): string[] {
  const terms: string[] = [];
  let currentTerm = '';
  let inQuotes = false;

  // Parse the query to handle quoted phrases
  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      // If we're closing quotes and have a term, add it
      if (!inQuotes && currentTerm.trim()) {
        terms.push(currentTerm.trim());
        currentTerm = '';
      }
    } else if (char === ' ' && !inQuotes) {
      // Space outside quotes separates terms
      if (currentTerm.trim()) {
        terms.push(currentTerm.trim());
        currentTerm = '';
      }
    } else {
      currentTerm += char;
    }
  }

  // Add the last term if present
  if (currentTerm.trim()) {
    terms.push(currentTerm.trim());
  }

  // Filter out Gmail-style search operators
  // (from:, to:, subject:, label:, has:attachment, etc.)
  return terms.filter((term) => {
    // Skip terms with a colon that are likely search operators
    if (term.includes(':')) return false;

    // Skip common Gmail operators
    const gmailOperators = ['has', 'is', 'in', 'label', 'larger', 'smaller', 'older', 'newer'];
    if (gmailOperators.some((op) => term.toLowerCase().startsWith(op + ':'))) return false;

    // Skip terms that are too short to be meaningful
    if (term.length < 3) return false;

    return true;
  });
}
