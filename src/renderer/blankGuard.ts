// A Refresh button in the middle of a blank window.
//
// The app renders into #root. When nothing ever gets there (a script failed
// before React mounted, the dev server was mid-rebuild, a module did not load)
// or everything leaves it again (the tree unmounted with no error boundary
// left to draw a screen), the window is blank and offers nothing to click. This
// runs beside the app, outside React, and after a grace period draws one
// centered Refresh that reloads the window. It goes away on its own as soon as
// the app draws something.
//
// Only the window being empty counts; a slow but rendering app (sign-in,
// skeletons, the inbox) is never covered.

const ROOT_ID = 'root';
// Startup normally mounts within a second; dev cold starts take a few.
const MOUNT_GRACE_MS = 8000;
// Once mounted, an empty root is a swap of trees for a frame or two, or a crash.
const EMPTY_GRACE_MS = 1500;
const POLL_MS = 500;

let overlay: HTMLElement | null = null;
let emptySince: number | null = null;
let mounted = false;

const darkMode = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

function buildOverlay(): HTMLElement {
  const dark = darkMode();
  const el = document.createElement('div');
  el.id = 'blank-guard';
  el.setAttribute('role', 'alert');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    zIndex: '2147483646',
    background: dark ? 'hsl(30 0% 10%)' : 'hsl(0 0% 99%)',
    color: dark ? 'hsl(0 0% 98%)' : 'hsl(240 10% 0%)',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: '14px',
    WebkitAppRegion: 'no-drag',
    userSelect: 'none'
  } as Partial<CSSStyleDeclaration>);

  // Frameless window: keep the top strip draggable while this is up.
  const grip = document.createElement('div');
  Object.assign(grip.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    height: '44px',
    WebkitAppRegion: 'drag'
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement('div');
  title.textContent = "Mail didn't load";
  title.style.fontWeight = '500';

  const hint = document.createElement('div');
  hint.textContent = 'Refresh to try again.';
  hint.style.color = dark ? 'hsl(240 5% 64.9%)' : 'hsl(240 3.8% 46%)';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Refresh';
  button.setAttribute('autofocus', '');
  Object.assign(button.style, {
    marginTop: '12px',
    padding: '8px 18px',
    border: 'none',
    borderRadius: '6px',
    background: dark ? 'hsl(0 0% 98%)' : 'hsl(240 10% 0%)',
    color: dark ? 'hsl(30 0% 10%)' : 'hsl(0 0% 99%)',
    fontSize: '14px',
    fontWeight: '550',
    cursor: 'pointer'
  } as Partial<CSSStyleDeclaration>);
  button.addEventListener('click', () => window.location.reload());

  el.append(grip, title, hint, button);
  return el;
}

function show(reason: string): void {
  if (overlay || !document.body) return;
  console.warn(`[blankGuard] window is blank (${reason}); showing Refresh`);
  overlay = buildOverlay();
  document.body.appendChild(overlay);
  overlay.querySelector('button')?.focus();
}

function hide(): void {
  overlay?.remove();
  overlay = null;
}

function check(): void {
  const root = document.getElementById(ROOT_ID);
  const empty = !root || root.childElementCount === 0;
  if (!empty) {
    mounted = true;
    emptySince = null;
    hide();
    return;
  }
  const now = performance.now();
  if (emptySince === null) emptySince = now;
  if (now - emptySince >= (mounted ? EMPTY_GRACE_MS : MOUNT_GRACE_MS)) {
    show(mounted ? 'the app unmounted' : 'the app never mounted');
  }
}

// Enter on the button is the click; ⌘R / Ctrl+R while the guard is up reloads too.
window.addEventListener('keydown', (event) => {
  if (overlay && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'r') {
    window.location.reload();
  }
});

// A script error before anything mounted will not fix itself: show at once.
window.addEventListener('error', () => {
  if (!mounted) show('a script error before the app mounted');
});

window.setInterval(check, POLL_MS);
