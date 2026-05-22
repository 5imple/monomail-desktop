function tryReload() {
  const params = new URLSearchParams(window.location.search);
  const appURL = params.get('appUrl');
  if (appURL) {
    window.location.href = appURL;
  }
}

window.addEventListener('online', tryReload);

document.addEventListener('DOMContentLoaded', () => {
  const reloadButton = document.getElementById('reload-button');
  reloadButton?.addEventListener('click', tryReload);

  const isWindows = /(win64)|(wow64)|(windows)/i.test(navigator.userAgent);
  if (isWindows) {
    document.body.classList.add('windows');
  }

  tryReload();
});
