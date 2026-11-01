// Plain keys (Enter, Space…) that the reader binds to shortcuts must step
// aside when they already have a job: a focused control (button, link, field,
// menu item…), the keyboard-highlighted item (activated by
// useKeyboardNavigation instead), or an open dialog/menu. Focus left on the
// hidden list row that opened the reader doesn't count.
const INTERACTIVE_FOCUS =
  'button, a[href], input, textarea, select, summary, [contenteditable="true"], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"], [role="combobox"], .keyboard-focused';

export const focusedElementOwnsKey = () => {
  if (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]'
    )
  ) {
    return true;
  }
  if (document.body.dataset.navMode === 'keyboard' && document.querySelector('.keyboard-focused')) {
    return true;
  }
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el.closest('[data-thread]')) return false;
  return el.isContentEditable || !!el.closest(INTERACTIVE_FOCUS);
};

// An expanded compose window covers the whole app (GlobalComposeCard is
// `absolute inset-0`), so plain-key shortcuts must not reach the hidden list or
// reader underneath it.
export const isComposeExpanded = () => !!document.querySelector('[data-compose-expanded="true"]');

// A dialog, menu or listbox is open: it owns Tab, Space, arrows and Enter.
export const overlayOpen = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"]'
  );

/** For list / reader navigation keys: step aside for compose and open overlays. */
export const navigationKeysBlocked = () => isComposeExpanded() || overlayOpen();

// "G then I" go-to sequences. A single-key shortcut fires whatever else was
// pressed before it, so without this the I / E / S / T / D of a go-to also ran
// its own command: "G then E" opened Done AND marked the email done. The
// capture-phase listener runs before the hotkey handlers and records whether
// the key being handled follows a plain G within a second.
let previousPlainKey = '';
let previousPlainKeyAt = -Infinity;
let completesGoToSequence = false;
const GO_TO_WINDOW_MS = 1000;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.repeat || ['Shift', 'Meta', 'Control', 'Alt', 'CapsLock'].includes(e.key)) return;
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
      const key = (e.key ?? '').toLowerCase();
      completesGoToSequence =
        plain &&
        key !== 'g' &&
        previousPlainKey === 'g' &&
        e.timeStamp - previousPlainKeyAt < GO_TO_WINDOW_MS;
      previousPlainKey = plain ? key : '';
      previousPlainKeyAt = e.timeStamp;
    },
    true
  );
}

/** The key being handled is the second key of a "G then …" go-to. */
export const completesGoTo = () => completesGoToSequence;

/**
 * A go-to hotkey as the sequence it is ("G>I", press G then I). Older stored
 * sidebar items say "G+I", which react-hotkeys-hook reads as G and I held
 * together.
 */
export const toGoToSequence = <T extends string | readonly string[] | undefined>(hotkey: T): T =>
  (typeof hotkey === 'string' ? hotkey.replace(/^g\+(?=[a-z0-9]$)/i, 'G>') : hotkey) as T;

/**
 * Go-to sequences bound by the GOTO_* commands (navigationCommands). A sidebar
 * row with the same keys leaves them to the command, so a sequence runs once.
 */
export const COMMAND_GO_TO_SEQUENCES = new Set(['G>I', 'G>E', 'G>S', 'G>T', 'G>D', 'G>L']);
