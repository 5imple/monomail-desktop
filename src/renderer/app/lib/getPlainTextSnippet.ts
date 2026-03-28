export function getPlainTextSnippet(html: string, length: number = 100): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent?.slice(0, length) || '';
}
