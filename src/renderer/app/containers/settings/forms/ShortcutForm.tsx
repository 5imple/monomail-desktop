import React from 'react';

import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/renderer/app/components/ui/table';
import { useCommandTable } from '@/renderer/app/lib/commands/useExcuteCommands';
import { useTranslation } from 'react-i18next';

// Keys handled outside the command list (keyboard navigation, the reader,
// undo, the palette), so they were missing from this page. Names are
// react-hotkeys-hook keys, which ShortcutKeyboard draws.
const NAVIGATION_SHORTCUTS: Array<{ key: string; title: string; hotkeys: string[] }> = [
  { key: 'next', title: 'Next conversation (list or reader)', hotkeys: ['J', 'down'] },
  { key: 'previous', title: 'Previous conversation (list or reader)', hotkeys: ['K', 'up'] },
  { key: 'open_row', title: 'Open the highlighted conversation', hotkeys: ['O', 'enter'] },
  { key: 'select_row', title: 'Select or deselect', hotkeys: ['X', 'space'] },
  { key: 'extend', title: 'Extend the selection', hotkeys: ['shift+up', 'shift+down'] },
  {
    key: 'split',
    title: 'Next / previous split (Inbox tabs)',
    hotkeys: ['tab', 'shift+tab']
  },
  { key: 'back', title: 'Back, or clear the selection', hotkeys: ['esc'] },
  { key: 'undo', title: 'Undo', hotkeys: ['Z'] },
  { key: 'palette', title: 'Command palette', hotkeys: ['MOD+K'] }
];

const titleCase = (scope: string) =>
  scope
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export function ShortcutForm() {
  const commands = useCommandTable();
  const { t } = useTranslation();

  const commandsByTitle = Object.values(commands).reduce(
    (acc, command) => {
      if (!command.hotkeys || command.hotkeys.length === 0) return acc;

      if (!acc[command.scope]) {
        acc[command.scope] = {};
      }

      if (!acc[command.scope][command.title]) {
        acc[command.scope][command.title] = [];
      }
      acc[command.scope][command.title].push(...command.hotkeys);

      return acc;
    },
    {} as Record<string, Record<string, string[]>>
  );

  // One row per key: commands that share the same keys (Mark as Read and Mark
  // as Unread on U, Star and Unstar on S…) were listed twice.
  const groupedCommands = Object.fromEntries(
    Object.entries(commandsByTitle).map(([scope, byTitle]) => {
      const rows = new Map<string, { titles: string[]; hotkeys: string[] }>();
      Object.entries(byTitle).forEach(([title, hotkeys]) => {
        const key = hotkeys.join('|');
        const row = rows.get(key);
        if (row) row.titles.push(title);
        else rows.set(key, { titles: [title], hotkeys });
      });
      return [
        scope,
        [...rows.values()].map(({ titles, hotkeys }) => ({ title: titles.join(' / '), hotkeys }))
      ];
    })
  ) as Record<string, Array<{ title: string; hotkeys: string[] }>>;

  const listed = new Set(
    Object.values(groupedCommands).flatMap((rows) => rows.map((row) => row.hotkeys.join('|')))
  );
  const navigationRows = NAVIGATION_SHORTCUTS.filter(
    (row) => !listed.has(row.hotkeys.join('|'))
  ).map((row) => ({
    title: t(`settings.shortcut.navigation.${row.key}`, row.title),
    hotkeys: row.hotkeys
  }));
  const sections: Array<[string, string, Array<{ title: string; hotkeys: string[] }>]> = [
    ['navigation', t('settings.shortcut.scopes.navigation', 'Navigation'), navigationRows],
    ...Object.entries(groupedCommands).map(
      ([scope, rows]) =>
        [scope, t(`settings.shortcut.scopes.${scope.toLowerCase()}`, titleCase(scope)), rows] as [
          string,
          string,
          Array<{ title: string; hotkeys: string[] }>
        ]
    )
  ];

  return (
    // Read-only page: a plain container (the form around it had no fields
    // and only a template debug submit).
    <div className="space-y-8">
      {sections
        .filter(([, , rows]) => rows.length > 0)
        .map(([scope, heading, rows]) => (
          <React.Fragment key={scope}>
            <div className="overflow-hidden rounded-md border shadow-sm">
              <Table className="">
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={2} className="bg-muted text-muted-foreground">
                      {heading}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ title, hotkeys }) => (
                    // A reference table: rows don't react to hover.
                    <TableRow key={title} className="hover:bg-transparent">
                      <TableCell>{title}</TableCell>
                      <TableCell className="w-32">
                        <div className="flex items-center gap-2">
                          {hotkeys.map((hotkey, index) => (
                            <React.Fragment key={hotkey}>
                              <ShortcutKeyboard className="" shortcut={hotkey} />
                              {index < hotkeys.length - 1 && (
                                <span className="text-xs text-muted-foreground">
                                  {t('settings.shortcut.or', 'or')}
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </React.Fragment>
        ))}
    </div>
  );
}
