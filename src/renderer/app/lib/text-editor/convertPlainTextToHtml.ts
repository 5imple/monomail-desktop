/**
 * Turns a draft body into editor/display HTML: HTML that already has
 * paragraphs or line breaks is returned as is; plain text becomes <p>
 * paragraphs (blank-line separated) with <br> for single newlines.
 *
 * Kept apart from TextEditor so displaying a draft (DraftCard) doesn't import
 * the editor and its extensions.
 */
export const convertPlainTextToHtml = (text: string): string => {
  const value = text ?? '';
  // Check if the content is already HTML (simple check for tags)
  if (/<\/?[a-z][\s\S]*>/i.test(value)) {
    // Already-formatted HTML (paragraphs or line breaks) is used as is.
    if (value.includes('<br') || value.includes('<p')) {
      return value;
    }
  }

  // Normalize line breaks to \n
  const normalizedText = value.replace(/\r\n/g, '\n');

  // Split by double newlines for paragraphs
  const htmlParagraphs = normalizedText
    .split('\n\n')
    .map((paragraph) => {
      if (!paragraph.trim()) return ''; // Skip empty paragraphs
      // Replace single newlines with <br> tags
      return `<p>${paragraph.replace(/\n/g, '<br>')}</p>`;
    })
    .filter(Boolean) // Remove any empty strings
    .join('');

  return htmlParagraphs || '<p></p>'; // Default to empty paragraph if nothing else
};
