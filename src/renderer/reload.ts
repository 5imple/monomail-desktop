// reload.html: shown by the main process when the renderer died (AppWindow
// render-process-gone). The window would otherwise stay blank. One Refresh
// button, in the middle, takes the window back to the app URL it was given;
// nothing reloads on its own, so a renderer that crashes on start cannot loop.

function refresh(): void {
  const appUrl = new URLSearchParams(window.location.search).get('appUrl');
  if (appUrl && /^(https?:|monomail-app:)/.test(appUrl)) {
    window.location.href = appUrl;
  } else {
    window.history.back();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('reload-button');
  button?.addEventListener('click', refresh);
  button?.focus();
});

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') refresh();
});
