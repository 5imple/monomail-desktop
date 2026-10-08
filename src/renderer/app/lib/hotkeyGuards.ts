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
