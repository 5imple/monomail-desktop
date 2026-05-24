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

  const escapedPlainTextBody = escapeHtml(plainTextBody);
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

  const rules = cssText.split('}');
  return rules
    .map((rule) => {
      const [selectors, properties] = rule.split('{');
      if (!properties) return rule; // Skip invalid rules

      // Check for exclusions and filter properties
      let processedProperties = properties;
      const selectorList = selectors.split(',').map((s) => s.trim());

      for (const exclusion of exclusions) {
        const hasExcludedSelector = selectorList.some((selector) =>
          selector.includes(exclusion.selector)
        );

        if (hasExcludedSelector) {
          processedProperties = processedProperties
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

      const wrappedSelectors = selectorList.map((selector) => `${wrapper} ${selector}`).join(', ');
      return `${wrappedSelectors} { ${processedProperties}`;
    })
    .join('} ');
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

function extractAndRemoveEmailHistory(body: HTMLElement): {
  cleanBody: HTMLElement;
  history: string[];
} {
  const history: string[] = [];
  const nodesToRemove: ChildNode[] = [];
  const historyStartPatterns = [
    // 영어 (English)
    /^---------- Forwarded message ---------$/i,
    /^-----Original Message-----$/i,
    /^From:/i,
    /^Date:/i,
    /^Subject:/i,
    /^To:/i,
    /^Cc:/i,
    /^Bcc:/i,
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

  function isHistoryElement(element: HTMLElement): boolean {
    const text = element.textContent?.trim() || '';
    return historyStartPatterns.some((pattern) => pattern.test(text));
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
      if (historyStartPatterns.some((pattern) => pattern.test(text))) {
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

  if (currentHistory.trim()) {
    history.push(currentHistory.trim());
  }

  // Remove nodes that are part of the history
  nodesToRemove.forEach((node) => node.parentNode?.removeChild(node));

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

function prepareEmailImages(root: HTMLElement) {
  root.querySelectorAll('img').forEach((img) => {
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
