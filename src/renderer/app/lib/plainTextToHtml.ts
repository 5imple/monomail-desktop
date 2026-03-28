/**
 * Converts plain text with newline characters to HTML format
 * suitable for the TipTap editor
 *
 * @param {string} plainText - Plain text with newline characters
 * @returns {string} HTML formatted text
 */
export const plainTextToHtml = (plainText) => {
  if (!plainText) return '';

  // Replace newlines with proper HTML paragraph breaks
  // Double newlines become new paragraphs
  // Single newlines become line breaks
  const withParagraphs = plainText
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return withParagraphs;
};

/**
 * Converts HTML formatted text back to plain text with newlines
 *
 * @param {string} html - HTML formatted text
 * @returns {string} Plain text with newline characters
 */
export const htmlToPlainText = (html) => {
  if (!html) return '';

  // Create a temporary DOM element to parse the HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Replace <p> with double newlines and <br> with single newlines
  let text = '';
  Array.from(tempDiv.childNodes).forEach((node, index) => {
    if (node.nodeName === 'P') {
      text += (index > 0 ? '\n\n' : '') + node.textContent;
    } else if (node.nodeName === 'BR') {
      text += '\n';
    } else if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  });

  return text;
};
