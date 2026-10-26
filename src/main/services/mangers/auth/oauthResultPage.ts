import { MAIN_STRINGS } from '@/main/utils/strings';
import { darkBackgroundColor, lightBackgroundColor } from '@/main/utils/contants';

// The page the OAuth loopback server shows in the browser when a sign-in flow
// ends. Styled like the app (its window background colours and font stack,
// light and dark). No script: browsers refuse window.close() on a tab the page
// did not open, and the app brings itself to the front once the account is
// saved (ipc-handlers/auth bringAppToFront).

export type OAuthResultKind = 'success' | 'cancelled' | 'failed';

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function oauthResultPage(kind: OAuthResultKind, detail?: string): string {
  const s = MAIN_STRINGS.oauth;
  const [title, body] =
    kind === 'success'
      ? [s.successTitle, s.successBody]
      : kind === 'cancelled'
        ? [s.cancelledTitle, s.cancelledBody]
        : [s.failedTitle, s.failedBody];
  const detailHtml = detail ? `<p class="detail">${escapeHtml(detail)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Mono Mail</title>
<style>
  :root { color-scheme: light dark; --bg: ${lightBackgroundColor}; --fg: #0a0a0a; --muted: #6b6b6b; --border: #e5e5e5; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: ${darkBackgroundColor}; --fg: #fafafa; --muted: #a3a3a3; --border: #333333; }
  }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg); color: var(--fg);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 420px; margin: 0 16px; padding: 32px; border: 1px solid var(--border); border-radius: 12px; }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
  p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
  .detail { margin-top: 12px; font-size: 13px; word-break: break-word; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${detailHtml}
</main>
</body>
</html>`;
}
