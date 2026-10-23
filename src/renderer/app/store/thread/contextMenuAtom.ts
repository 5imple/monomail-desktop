import { atom } from 'jotai';

/**
 * True while a row's context menu stands in for the selection: right-clicking
 * a row outside the selection selects just that row for the menu's commands
 * and puts the previous selection back on close. The selection bar stays
 * down for that stand-in, so it doesn't flash under every right-click.
 */
export const contextMenuSelectionAtom = atom(false);
