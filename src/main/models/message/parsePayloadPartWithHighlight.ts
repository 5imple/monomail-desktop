import log from 'electron-log';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { transformEmailForDarkMode } from '@/main/models/message/transformEmailForDarkMode';
import { parsePayloadPart } from '@/main/models/message/utils';

export interface ParsedPayload {
  content: string;
  history: string[];
  trackingImagesRemoved?: number;
  trackingDomains?: string[];
}

// Parsed bodies, most recently used last. Bounded: every message read (per
// search / theme variant) used to stay for the whole session. An open reader
// keeps its own parse (MessageCard memo), so evicting an old entry only costs
// a re-parse if that message is opened again much later.
const PARSED_CACHE_MAX_ENTRIES = 200;
const parsedContentCache = new Map<string, ParsedPayload>();

const cacheGet = (key: string): ParsedPayload | undefined => {
  const hit = parsedContentCache.get(key);
  if (hit) {
    parsedContentCache.delete(key);
    parsedContentCache.set(key, hit);
  }
  return hit;
};

const cacheSet = (key: string, value: ParsedPayload) => {
  parsedContentCache.set(key, value);
  while (parsedContentCache.size > PARSED_CACHE_MAX_ENTRIES) {
    const oldest = parsedContentCache.keys().next().value;
    if (oldest === undefined) break;
    parsedContentCache.delete(oldest);
  }
};

// Parse timing in the dev log. Optional chaining: the unit tests bundle this
// file with esbuild, where import.meta.env is unset.
const DEV_TIMING = Boolean(import.meta.env?.DEV);

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
    const content = node.textContent || '';

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

    const terms = searchTerms.filter((term) => term);
    if (terms.length === 0) return;
    // One alternation (longest first) so a later term can never match inside
    // the markup of an earlier term's highlight.
    const regex = new RegExp(
      `(${[...terms]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join('|')})`,
      'gi'
    );
    const parts = content.split(regex);
    if (parts.length === 1) return;

    // Build the highlight with DOM nodes. Re-parsing the decoded text through
    // innerHTML turned escaped text like "&lt;img src=…&gt;" (or the
    // "<john@example.com>" in a plain-text "… wrote:" line) back into live
    // markup after sanitization had already run.
    const doc = node.ownerDocument;
    const fragment = doc.createDocumentFragment();
    parts.forEach((part, index) => {
      if (!part) return;
      // split() with a capture group puts the matches at the odd indices.
      if (index % 2 === 1) {
        const span = doc.createElement('span');
        span.className = 'bg-amber-300 dark:bg-yellow-80 rounded-sm mono-search-highlight';
        span.setAttribute('style', 'color: black !important;');
        span.textContent = part;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(doc.createTextNode(part));
      }
    });
    node.parentNode?.replaceChild(fragment, node);
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

function getPayloadCacheSignature(message: MonoMessage): string {
  const payloadParts: string[] = [];

  function visitPayload(part: MonoMessage['payload']) {
    payloadParts.push(
      [
        part.partId,
        part.mimeType,
        part.body?.attachmentId ?? '',
        part.body?.size ?? 0,
        part.body?.data?.length ?? 0,
        part.parts?.length ?? 0
      ].join(':')
    );

    part.parts?.forEach(visitPayload);
  }

  visitPayload(message.payload);

  const inlineImageSignature = Object.entries(message.inlineImages)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([contentId, attachment]) =>
        `${contentId}:${attachment.attachmentId}:${attachment.mimeType}:${attachment.size}`
    )
    .join('|');

  return `${message.historyId ?? ''}:${payloadParts.join('|')}:${inlineImageSignature}`;
}

/**
 * Modified version of parsePayloadPart to include search highlighting
 * @param {MonoMessage} message - The message object
 * @param {string} searchQuery - The search query
 * @returns {Object} - The parsed content with highlighted search terms
 */
const cacheKeyOf = (message: MonoMessage, searchQuery: string, isDarkMode: boolean) =>
  [message.id, searchQuery, isDarkMode ? 'dark' : 'light', getPayloadCacheSignature(message)].join(
    ':'
  );

/** Whether `message`'s parse (for this search / theme) is already cached. */
export function hasParsedPayload(
  message: MonoMessage,
  searchQuery: string,
  isDarkMode: boolean
): boolean {
  return parsedContentCache.has(cacheKeyOf(message, searchQuery, isDarkMode));
}

export function parsePayloadPartWithHighlight(
  message: MonoMessage,
  searchQuery: string,
  isDarkMode: boolean
): ParsedPayload {
  const cacheKey = cacheKeyOf(message, searchQuery, isDarkMode);

  // Check if we have a cached result
  const cachedResult = cacheGet(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const startedAt = performance.now();
  const rawParsedContent = parsePayloadPart(message);

  const parsed = {
    content: isDarkMode
      ? transformEmailForDarkMode(rawParsedContent.content, true)
      : rawParsedContent.content,
    // History fragments are mounted with dangerouslySetInnerHTML, so they must
    // be sanitised: parsePayloadPart already runs each one through the same
    // DOMPurify policy as the body (utils.extractAndRemoveEmailHistory →
    // sanitizeEmailHtml, its only producer; <style> blocks are stripped from
    // the document before history is extracted). A second pass here cost a
    // full DOMPurify run over the quoted history on every open. The dark-mode
    // transform re-sanitises with its own policy.
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
  cacheSet(cacheKey, result);

  if (DEV_TIMING) {
    // Dev only: parsing (and in dark mode, re-colouring) a body is on the path
    // from click to text on screen, so say when it costs more than a frame.
    const elapsed = performance.now() - startedAt;
    if (elapsed > 16) {
      log.debug(
        `[reader] parsed message ${message.id} in ${Math.round(elapsed)} ms (${Math.round(result.content.length / 1024)} KB${isDarkMode ? ', dark mode' : ''})`
      );
    }
  }

  return result;
}
