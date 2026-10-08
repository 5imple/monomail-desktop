export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * The platform's command modifier — what react-hotkeys-hook calls MOD: Cmd on
 * macOS, Ctrl elsewhere. Raw keydown handlers that checked only metaKey made
 * Ctrl+Enter insert a line break on Windows instead of sending.
 */
export const hasModKey = (event: { metaKey: boolean; ctrlKey: boolean }): boolean =>
  isMac ? event.metaKey : event.ctrlKey;
