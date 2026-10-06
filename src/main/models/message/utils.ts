import { GmailMessage, GmailMessagePayload } from '@/main/api/gmail/types';
import { MonoMessage } from '@/main/models/message/MonoMessage';
import { MonoAttachment } from '@/main/models/types';
import DOMPurify from 'dompurify';

export function parseGmailMessage(message: GmailMessage): MonoMessage {
  return new MonoMessage({
    id: message.id,
    timestamp: message.timestamp,
    timezone: message.timezone,
    threadId: message.threadId,
    subject: message.subject ?? '',
    labelIds: message.labelIds,
    snippet: message.snippet,
    historyId: message.historyId,
    cc: message.cc,
    bcc: message.bcc,
    to: message.to,
    from: message.from,
    inlineImageSize: message.inlineImageSize,
    inlineImages: message.inlineImages,
    listUnsubscribe: message.listUnsubscribe,
    attachments: message.attachments,
    payload: message.payload
  });
}

export function parsePayloadPart(message: MonoMessage) {
  let plainTextBody = '';
  let htmlBody = '';
  let emailHistory: string[] = [];
  let trackingImagesRemoved = 0;
  let trackingDomains: string[] = [];

  const textDecoder = new TextDecoder('utf-8');

  function parsePayload(part: GmailMessagePayload) {
    if (part.mimeType === 'text/plain' && part.body.data) {
      plainTextBody += decodePayloadData(part.body.data, textDecoder);
    } else if (part.mimeType === 'text/html' && part.body.data) {
      const decodedHtml = decodePayloadData(part.body.data, textDecoder);

      const parser = new DOMParser();
      const doc = parser.parseFromString(decodedHtml, 'text/html');

      // Process style elements
      const scopedStyleBlocks = Array.from(doc.querySelectorAll('style')).map((style) => {
        style.textContent = wrapCssRules(style.textContent || '', '.mono-content-reset');
        const scopedStyle = serializeScopedStyle(style.textContent || '');
        style.remove();
        return scopedStyle;
      });

      // Remove specific styles and set anchor attributes
      doc.body.querySelectorAll('*').forEach((element) => {
        removeSpecificStyles(element);
        // adjustAttributesForDarkMode(element, true);
      });
      doc.querySelectorAll('a').forEach(setAnchorAttributes);

      // Upgrade http:// image references before history extraction so both
      // the visible body and quoted fragments are covered.
      upgradeInsecureImageSources(doc);

      // Remove img tags with data-mono-tracking attribute
      const trackingResult = removeTrackingImages(doc);
      trackingImagesRemoved += trackingResult.count;
      trackingDomains = [...trackingDomains, ...trackingResult.domains];

      // Extract email history and remove it from the main body
      const { cleanBody, history } = extractAndRemoveEmailHistory(doc.body);
      emailHistory = [...emailHistory, ...history];

      // Handle inline images with cid
      processInlineImages(doc, message.id, message.inlineImages);
      prepareEmailImages(cleanBody);

      // Wrap the cleaned HTML in a container with a unique class
      if (cleanBody.innerHTML.length > 0) {
        htmlBody += `
        <div class="mono-content">
          ${scopedStyleBlocks.join('')}${sanitizeEmailHtml(cleanBody.innerHTML)}
        </div>`;
      }
    }

    if (part.parts) {
      for (const subPart of part.parts) {
        parsePayload(subPart);
      }
    }
  }
  parsePayload(message.payload);

  const escapedPlainTextBody = linkifyPlainText(plainTextBody);
  plainTextBody = `<div class="p-6 min-h-6" style="white-space: pre-wrap;">${escapedPlainTextBody}</div>`;

  return {
    history: emailHistory,
    content: htmlBody.length > 0 ? htmlBody : plainTextBody,
    trackingImagesRemoved,
    trackingDomains: [...new Set(trackingDomains)] // Remove duplicates
  };
}

function decodePayloadData(data: string, textDecoder: TextDecoder): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const decodedData = atob(padded);

  return textDecoder.decode(new Uint8Array([...decodedData].map((char) => char.charCodeAt(0))));
}

function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['center', 'div', 'font', 'style'],
    ADD_ATTR: [
      'align',
      'alt',
      'background',
      'bgcolor',
      'bgColor',
      'border',
      'bordercolor',
      'borderColor',
      'cellpadding',
      'cellspacing',
      'class',
      'color',
      'data-attachment-id',
      'data-content-id',
      'data-open-modal',
      'decoding',
      'height',
      'href',
      'loading',
      'referrerpolicy',
      'role',
      'src',
      'style',
      'target',
      'title',
      'valign',
      'width'
    ],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus'],
    FORBID_TAGS: ['base', 'embed', 'iframe', 'meta', 'object', 'script']
  });
}

function serializeScopedStyle(cssText: string): string {
  const safeCssText = cssText.replace(/<\/style/gi, '<\\/style');
  return `<style>${safeCssText}</style>`;
}

/**
 * Escape a plain-text body and turn its http(s) URLs into links. Plain-text
 * mail (password resets, ticket notifications) otherwise showed every URL as
 * dead text. Each piece is escaped separately, so the URL can't break out of
 * the attribute; anchors get the same attributes as setAnchorAttributes.
 */
export function linkifyPlainText(text: string): string {
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(urlPattern)) {
    let url = match[0];
    // Sentence punctuation right after a URL isn't part of it.
    const trailing = url.match(/[.,;:!?)\]]+$/)?.[0] ?? '';
    if (trailing) url = url.slice(0, -trailing.length);
    const start = match.index ?? 0;
    html += escapeHtml(text.slice(last, start));
    html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" data-open-modal="true" class="text-blue-600 underline">${escapeHtml(url)}</a>`;
    last = start + url.length;
  }
  return html + escapeHtml(text.slice(last));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function removeSpecificStyles(element: Element) {
  const style = (element as HTMLElement).style;
  if (style) {
    style.removeProperty('box-shadow');
    style.removeProperty('text-shadow');
    // style.removeProperty('min-width');
    // if (element.tagName === 'A') style.removeProperty('color');
  }
}

function removeTrackingImages(doc: Document): { count: number; domains: string[] } {
  const images = doc.querySelectorAll('img');
  let count = 0;
  const domains: string[] = [];

  const extractDomain = (url: string): string => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch {
      // If URL parsing fails, try to extract domain manually
      const match = url.match(/^https?:\/\/([^\\/]+)/);
      return match ? match[1] : 'unknown';
    }
  };

  images.forEach((img) => {
    const src = img.getAttribute('src');

    // Remove images with data-mono-tracking attribute
    if (img.hasAttribute('data-mono-tracking')) {
      // if (src) {
      //   const domain = extractDomain(src);
      //   if (!domains.includes(domain)) {
      //     domains.push(domain);
      //   }
      // }
      img.remove();
      // count++;
      return;
    }

    // Remove images with 1px or 0px dimensions
    const width = img.getAttribute('width') || img.style.width;
    const height = img.getAttribute('height') || img.style.height;

    // Check for pixel tracking images (1px x 1px or 0px dimensions)
    const isTrackingPixel =
      width === '1' ||
      width === '1px' ||
      width === '0' ||
      width === '0px' ||
      height === '1' ||
      height === '1px' ||
      height === '0' ||
      height === '0px';

    if (isTrackingPixel && src) {
      const domain = extractDomain(src);
      if (!domains.includes(domain)) {
        domains.push(domain);
      }
      img.remove();
      count++;
    }
  });

  return { count, domains };
}

function wrapCssRules(cssText: string, wrapper: string): string {
  // Define selectors and properties to exclude
  const exclusions = [
    { selector: '.inner-header', properties: ['background-color'] }
    // Add more exclusions here as needed
    // { selector: '.footer', properties: ['background-color', 'border'] },
  ];

  const filterExcludedProperties = (selectorList: string[], body: string): string => {
    let result = body;
    for (const exclusion of exclusions) {
      const hasExcludedSelector = selectorList.some((selector) =>
        selector.includes(exclusion.selector)
      );
      if (hasExcludedSelector) {
        result = result
          .split(';')
          .filter((prop) => {
            const propName = prop.trim().toLowerCase().split(':')[0];
            return !exclusion.properties.some((excluded) =>
              propName.startsWith(excluded.toLowerCase())
            );
          })
          .join(';');
      }
    }
    return result;
  };

  const prefixSelectors = (selectors: string): string =>
    selectors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `${wrapper} ${s}`)
      .join(', ');

  // Walk the stylesheet honoring brace nesting. A naive split on `{`/`}`
  // flattens `@media`/`@supports` blocks, hoisting their inner rules to the
  // top level — so a mobile-only override like `@media (max-width:480px){
  // .x{width:25px} }` would apply at every width and collapse the layout.
  const scope = (css: string): string => {
    let out = '';
    let i = 0;
    while (i < css.length) {
      const brace = css.indexOf('{', i);
      if (brace === -1) {
        out += css.slice(i);
        break;
      }
      const prelude = css.slice(i, brace).trim();
      let depth = 1;
      let j = brace + 1;
      while (j < css.length && depth > 0) {
        const ch = css[j];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        j++;
      }
      const body = css.slice(brace + 1, j - 1);
      i = j;
      if (!prelude) continue;

      if (prelude.startsWith('@')) {
        const at = prelude.toLowerCase();
        if (at.startsWith('@media') || at.startsWith('@supports') || at.startsWith('@container')) {
          // Keep the conditional wrapper, scope the rules inside it.
          out += `${prelude} { ${scope(body)} } `;
        } else {
          // @font-face / @keyframes / @page etc. — leave the block intact;
          // their inner blocks are not element selectors.
          out += `${prelude} { ${body} } `;
        }
      } else {
        const selectorList = prelude.split(',').map((s) => s.trim());
        out += `${prefixSelectors(prelude)} { ${filterExcludedProperties(selectorList, body)} } `;
      }
    }
    return out;
  };

  return scope(cssText);
}

function setAnchorAttributes(anchor: HTMLAnchorElement) {
  anchor.setAttribute('target', '_blank');
  // rel=noopener prevents the opened page from accessing window.opener;
  // rel=noreferrer also strips the Referer header. Without these, every
  // email anchor gives the destination page a handle back into the
  // renderer (window.opener) — even though Electron typically opens
  // these via shell.openExternal, we belt-and-suspender it for the
  // browser-deployable build path.
  anchor.setAttribute('rel', 'noopener noreferrer');
  anchor.setAttribute('data-open-modal', 'true');
  anchor.classList.add('text-blue-600', 'underline');
}

export function extractAndRemoveEmailHistory(body: HTMLElement): {
  cleanBody: HTMLElement;
  history: string[];
} {
  const history: string[] = [];
  const nodesToRemove: ChildNode[] = [];
  const historyStartPatterns = [
    // 영어 (English)
    /^---------- Forwarded message ---------$/i,
    /^-----Original Message-----$/i,
    /^On .* wrote:$/i,

    // 스페인어 (Spanish)
    /^---------- Mensaje reenviado ---------$/i,
    /^-----Mensaje original-----$/i,
    /^En .* escribió:$/i,

    // 프랑스어 (French)
    /^---------- Message transféré ---------$/i,
    /^-----Message d'origine-----$/i,
    /^Le .* a écrit :$/i,

    // 독일어 (German)
    /^---------- Weitergeleitete Nachricht ---------$/i,
    /^-----Ursprüngliche Nachricht-----$/i,
    /^Am .* schrieb:$/i,

    // 한국어 (Korean)
    /^---------- 전달된 메시지 ---------$/i,
    /^-----원본 메시지-----$/i,
    /^.*님이 작성:*$/i,

    // 중국어 (Chinese)
    /^---------- 转发的邮件 ---------$/i,
    /^-----原始邮件-----$/i,
    /^在 .* 写道:$/i,

    // 일본어 (Japanese)
    /^---------- 転送されたメッセージ ---------$/i,
    /^-----オリジナルメッセージ-----$/i,
    /^.*さんは書きました:$/i
  ];

  let currentHistory = '';
  let inHistory = false;

  // A bare "From:/Date:/To:" line is NOT a history marker on its own —
  // treating it as one hid everything after "Date: Fri Oct 9" in an event
  // email or "To: All students" in a memo. Only an actual reply header block
  // (Outlook/Apple Mail style: From: plus another header label, on the same or
  // the following lines) starts the quoted history.
  const headerLinePattern = /^(From|Sent|Date|To|Subject|Cc|Bcc)\s*:/i;

  function isReplyHeaderBlock(node: Node): boolean {
    if (!headerLinePattern.test(node.textContent?.trim() || '')) return false;
    let text = node.textContent || '';
    let sibling = node.nextSibling;
    for (let i = 0; i < 4 && sibling; sibling = sibling.nextSibling) {
      const siblingText = sibling.textContent || '';
      if (!siblingText.trim()) continue;
      text += '\n' + siblingText;
      i++;
    }
    const labels = new Set(
      Array.from(text.matchAll(/\b(From|Sent|Date|To|Subject)\s*:/gi), (m) => m[1].toLowerCase())
    );
    return labels.has('from') && labels.size >= 2;
  }

  function isHistoryStart(node: Node): boolean {
    const text = node.textContent?.trim() || '';
    return historyStartPatterns.some((pattern) => pattern.test(text)) || isReplyHeaderBlock(node);
  }

  function isHistoryElement(element: HTMLElement): boolean {
    return isHistoryStart(element);
  }

  function traverseNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;

      if (element.hasAttribute('data-history')) {
        // Handle the entire block of history in one go
        currentHistory += element.outerHTML;
        nodesToRemove.push(element);
        return;
      }

      if (isHistoryElement(element)) {
        inHistory = true;
        currentHistory += element.outerHTML + '\n';
        nodesToRemove.push(node as ChildNode);
      } else if (inHistory) {
        currentHistory += element.outerHTML + '\n';
        nodesToRemove.push(node as ChildNode);
      } else {
        element.childNodes.forEach(traverseNode);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() || '';
      if (isHistoryStart(node)) {
        inHistory = true;
        currentHistory += text + '\n';
        nodesToRemove.push(node as ChildNode);
      } else if (inHistory) {
        currentHistory += text + '\n';
        nodesToRemove.push(node as ChildNode);
      }
    }
  }

  // Start traversing the body
  body.childNodes.forEach(traverseNode);

  // Snapshot before removal so we can bail out if extraction would empty the body.
  const bodyHtmlBeforeRemoval = body.innerHTML;

  // Remove nodes that are part of the history
  nodesToRemove.forEach((node) => node.parentNode?.removeChild(node));

  // Guard: never let history-extraction swallow the entire visible body. If the
  // whole message tripped a "From:/On … wrote:" pattern and removal left nothing
  // visible, restore the full body and skip extraction — showing the email with
  // quoted text inline beats rendering a blank message.
  if (!(body.textContent || '').trim()) {
    body.innerHTML = bodyHtmlBeforeRemoval;
    return { cleanBody: body, history: [] };
  }

  if (currentHistory.trim()) {
    history.push(sanitizeEmailHtml(currentHistory.trim()));
  }

  return { cleanBody: body, history };
}

function normalizeContentId(value?: string | null): string {
  if (!value) return '';

  let normalized = value.trim().replace(/^cid:/i, '').replace(/^<|>$/g, '');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep the sender-provided value when it is not valid URI encoding.
  }

  return normalized.trim().replace(/^<|>$/g, '');
}

function getInlineAttachment(
  inlineImages: Record<string, MonoAttachment>,
  contentId: string
): MonoAttachment | undefined {
  const normalizedContentId = normalizeContentId(contentId);
  if (!normalizedContentId) return undefined;

  return (
    inlineImages[normalizedContentId] ??
    Object.entries(inlineImages).find(
      ([key]) => normalizeContentId(key) === normalizedContentId
    )?.[1]
  );
}

/**
 * The renderer CSP only allows https:/data:/blob: images (`img-src`), so a
 * plaintext-HTTP `<img>` never loads — Chromium blocks it, the error handler
 * fires, and the card shows "Image unavailable" (e.g. Zoom webinar mail
 * references `http://servicenow.zoom.us/...` banners). Upgrade the scheme the
 * same way browser mixed-content autoupgrade does. Protocol-relative `//host`
 * URLs are upgraded too: they resolve against the app origin
 * (`monomail-app://` in the packaged build), which is never right for mail.
 * Hosts that genuinely can't serve https fall into the existing fallback.
 */
function upgradeInsecureImageSources(doc: Document) {
  const upgrade = (value: string | null): string | null => {
    if (!value) return null;
    if (/^http:\/\//i.test(value)) return value.replace(/^http:\/\//i, 'https://');
    if (/^\/\//.test(value)) return `https:${value}`;
    return null;
  };

  doc.querySelectorAll('img').forEach((img) => {
    const upgraded = upgrade(img.getAttribute('src'));
    if (upgraded) img.setAttribute('src', upgraded);
  });

  // `background` on table/td/body is an image fetch governed by img-src too.
  doc.querySelectorAll('[background]').forEach((element) => {
    const upgraded = upgrade(element.getAttribute('background'));
    if (upgraded) element.setAttribute('background', upgraded);
  });
}

function prepareEmailImages(root: HTMLElement) {
  root.querySelectorAll('img').forEach((img) => {
    // Runs after processInlineImages, which tags every loadable inline image
    // with data-attachment-id. An image with no source — Outlook keeps the tag
    // of a quoted message's signature image (data-imagetype="AttachmentByCid",
    // src="") but not its attachment — or a cid: reference with no matching
    // inline attachment can never load; drop it rather than render a broken-
    // image icon next to its alt text ("Image").
    const src = (img.getAttribute('src') ?? '').trim();
    if (!img.hasAttribute('data-attachment-id') && (src === '' || /^cid:/i.test(src))) {
      img.remove();
      return;
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.style.maxWidth = '100%';
    if (!img.getAttribute('alt')) img.setAttribute('alt', '');
  });
}

function processInlineImages(
  doc: Document,
  messageId: string,
  inlineImages: Record<string, MonoAttachment>
) {
  const imgElements = doc.querySelectorAll('img');
  Array.from(imgElements).forEach((img) => {
    const src = img.getAttribute('src');
    if (!src || !/^cid:/i.test(src)) return;

    const cid = normalizeContentId(src);
    const attachment = getInlineAttachment(inlineImages, cid);

    if (attachment) {
      try {
        img.setAttribute('data-content-id', cid);
        img.setAttribute('data-attachment-id', attachment.attachmentId);
        img.setAttribute('src', '');
      } catch (error) {
        console.error(`Error fetching attachment for cid: ${cid} in message ${messageId}`, error);
        img.remove();
      }
    }
  });
}
