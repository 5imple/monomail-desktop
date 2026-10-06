/**
 * Decode HTML entities that Gmail pre-encodes in snippet/subject fields
 * (e.g. &#39; → ', &amp; → &, &lt; → <). Must run before escapeHtml so
 * the caller doesn't see double-encoded output like &amp;#39;.
 */
function decodeGmailEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

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

  // Decode Gmail's pre-encoded entities first; every piece is re-escaped
  // below so the output is safe for dangerouslySetInnerHTML without
  // double-encoding (e.g. &#39;).
  const plainText = decodeGmailEntities(text);

  const searchTerms = searchQuery
    ? extractSearchTerms(searchQuery).filter((term) => term.length >= 2)
    : [];
  if (searchTerms.length === 0) return escapeHtml(plainText);

  // One pass with all terms (longest first) over the PLAIN text, escaping each
  // piece. Running a regex per term over already-highlighted HTML let a later
  // term ("class", "text", "amp") match inside an earlier highlight's markup
  // or split an entity, and rows showed literal `text-black rounded-sm…">`.
  const pattern = [...searchTerms]
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const parts = plainText.split(new RegExp(`(${pattern})`, 'gi'));

  // split() with a capture group puts the matches at the odd indices.
  return parts
    .map((part, index) =>
      index % 2 === 1
        ? `<span class="bg-amber-300 dark:bg-yellow-80 text-black rounded-sm select-text">${escapeHtml(part)}</span>`
        : escapeHtml(part)
    )
    .join('');
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
