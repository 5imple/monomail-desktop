/**
 * Escape HTML metacharacters so untrusted input can't introduce markup
 * when the result is later mounted via dangerouslySetInnerHTML.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Highlight search terms in thread list text (subject or snippet).
 *
 * The result is mounted via dangerouslySetInnerHTML in ThreadListItem /
 * ThreadListCozyItem / ThreadListDenseItem / DisplayPanelHeader, so input
 * MUST be HTML-escaped before any markup is injected — otherwise a sender
 * can deliver `<img src=x onerror=…>` as a subject and execute script on
 * every recipient (XSS → renderer compromise → token exfiltration).
 *
 * @param {string} text - The plain-text subject or snippet (untrusted)
 * @param {string} searchQuery - The search query string
 * @returns {string} - Escaped HTML with highlight spans around matches
 */
export function highlightThreadText(text: string, searchQuery: string): string {
  if (!text) return '';

  // Always escape first — the return value is treated as HTML by callers.
  const escapedText = escapeHtml(text);

  if (!searchQuery) return escapedText;

  // Extract search terms from the query
  const searchTerms = extractSearchTerms(searchQuery);
  let highlightedText = escapedText;

  for (const term of searchTerms) {
    if (term.length < 2) continue; // Skip very short terms

    // Escape the search term as HTML too, then as a regex literal — the
    // highlight spans wrap matches of the *escaped* form because that's
    // what's in highlightedText now.
    const escapedHtmlTerm = escapeHtml(term);
    const escapedRegexTerm = escapedHtmlTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(`(${escapedRegexTerm})`, 'gi');

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
