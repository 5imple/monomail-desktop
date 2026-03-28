import { MonoMessage } from '@/main/models/message/MonoMessage';
import { transformEmailForDarkMode } from '@/main/models/message/transformEmailForDarkMode';
import { parsePayloadPart } from '@/main/models/message/utils';

// Cache for parsed content
const parsedContentCache = new Map<string, { content: string; history: string[] }>();

/**
 * Function to highlight search terms in HTML content
 * @param {string} html - The HTML content to process
 * @param {string} searchQuery - The search query string
 * @returns {string} - HTML with highlighted search terms
 */
export function highlightSearchTerms(html: string, searchQuery: string): string {
  if (!searchQuery || searchQuery.trim() === '') {
    return html;
  }

  // Create a DOM parser to manipulate the HTML content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Extract search terms from the query (handle quoted phrases and individual words)
  const searchTerms = extractSearchTerms(searchQuery);

  // Process text nodes to highlight search terms
  highlightTextNodes(doc.body, searchTerms);

  return doc.body.innerHTML;
}

/**
 * Extract search terms from a query string, respecting quotes for phrases
 * @param {string} query - The search query
 * @returns {string[]} - Array of search terms
 */
function extractSearchTerms(query) {
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

  // Filter out search operators like from:, to:, subject:, etc.
  return terms.filter((term) => {
    return !term.includes(':') && term.length > 2;
  });
}

/**
 * Recursive function to highlight text in all text nodes
 * @param {Node} node - The node to process
 * @param {string[]} searchTerms - Array of search terms to highlight
 */
function highlightTextNodes(node, searchTerms) {
  if (node.nodeType === Node.TEXT_NODE) {
    let content = node.textContent || '';
    let highlighted = false;

    // Skip empty text nodes
    if (!content.trim()) return;

    // Skip nodes that are already inside a highlight span
    if (
      node.parentNode &&
      node.parentNode.nodeName === 'SPAN' &&
      node.parentNode.classList.contains('mono-search-highlight')
    ) {
      return;
    }

    for (const term of searchTerms) {
      // Create a case-insensitive regex for the search term
      const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');

      if (regex.test(content)) {
        highlighted = true;
        content = content.replace(
          regex,
          '<span class="bg-amber-300 dark:bg-yellow-80 rounded-sm mono-search-highlight" style="color: black !important;">$1</span>'
        );
      }
    }

    if (highlighted) {
      // Create a temporary element to hold the new HTML
      const temp = document.createElement('div');
      temp.innerHTML = content;

      // Replace the text node with the highlighted content
      const parent = node.parentNode;
      if (parent) {
        const fragment = document.createDocumentFragment();
        while (temp.firstChild) {
          fragment.appendChild(temp.firstChild);
        }
        parent.replaceChild(fragment, node);
      }
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // Skip script, style, and already highlighted elements
    if (
      ['SCRIPT', 'STYLE'].includes(node.nodeName) ||
      (node.nodeName === 'SPAN' && node.classList.contains('mono-search-highlight'))
    ) {
      return;
    }

    // Process child nodes
    const childNodes = Array.from(node.childNodes);
    for (const child of childNodes) {
      highlightTextNodes(child, searchTerms);
    }
  }
}

/**
 * Escape special characters in string for use in regex
 * @param {string} string - The string to escape
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Modified version of parsePayloadPart to include search highlighting
 * @param {MonoMessage} message - The message object
 * @param {string} searchQuery - The search query
 * @returns {Object} - The parsed content with highlighted search terms
 */
export function parsePayloadPartWithHighlight(
  message: MonoMessage,
  searchQuery: string,
  isDarkMode: boolean
) {
  // Create a cache key based on message ID, search query, and dark mode
  const cacheKey = `${message.id}-${searchQuery}-${isDarkMode}`;

  // Check if we have a cached result
  const cachedResult = parsedContentCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const rawParsedContent = parsePayloadPart(message);

  const parsed = {
    content: isDarkMode
      ? transformEmailForDarkMode(rawParsedContent.content, true)
      : rawParsedContent.content,
    history: isDarkMode
      ? rawParsedContent.history.map((history) => transformEmailForDarkMode(history, true))
      : rawParsedContent.history,
    trackingImagesRemoved: rawParsedContent.trackingImagesRemoved,
    trackingDomains: rawParsedContent.trackingDomains
  };

  // Only apply highlighting if there's a search query
  const result =
    searchQuery && searchQuery.trim() !== ''
      ? {
          content: highlightSearchTerms(parsed.content, searchQuery),
          history: parsed.history.map((historyItem) =>
            highlightSearchTerms(historyItem, searchQuery)
          ),
          trackingImagesRemoved: parsed.trackingImagesRemoved,
          trackingDomains: parsed.trackingDomains
        }
      : parsed;

  // Cache the result
  parsedContentCache.set(cacheKey, result);

  return result;
}

// Clear cache when needed (e.g., when memory usage is high)
export function clearParsePayloadPartCache() {
  parsedContentCache.clear();
}
