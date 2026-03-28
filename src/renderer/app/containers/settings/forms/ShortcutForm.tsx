import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Form } from '@/renderer/app/components/ui/form';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/renderer/app/components/ui/table';
import { useCommands } from '@/renderer/app/lib/commands/useCommands';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const shortcutFormSchema = z.object({});

type ShortcutFormValues = z.infer<typeof shortcutFormSchema>;

export function ShortcutForm() {
  const commands = useCommands();
  const { t } = useTranslation();

  const form = useForm<ShortcutFormValues>({
    resolver: zodResolver(shortcutFormSchema),
    mode: 'onChange'
  });

  function onSubmit(data: ShortcutFormValues) {
    try {
      toast(
        <div>
          <div>You submitted the following values:</div>
          <pre className="mt-2 w-full rounded-md bg-slate-950 p-4">
            <code className="text-white">{JSON.stringify(data, null, 2)}</code>
          </pre>
        </div>
      );
    } catch (error) {
      console.error('Error updating shortcut:', error);
      toast.error(t('toast.error.shortcut_update'));
    }
  }

  const groupedCommands = Object.values(commands).reduce(
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {Object.entries(groupedCommands).map(([scope, commands]) => (
          <React.Fragment key={scope}>
            <div className="overflow-hidden rounded-md border shadow-sm">
              <Table className="">
                <TableHeader>
                  <TableRow>
                    <TableHead colSpan={3} className="bg-muted text-muted-foreground">
                      {scope
                        .toLowerCase()
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, (char) => char.toUpperCase())}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(commands).map(([title, hotkeys]) => (
                    <TableRow key={title}>
                      <TableCell>{title}</TableCell>
                      <TableCell className="w-32">
                        <div className="flex gap-2">
                          {hotkeys.map((hotkey, index) => (
                            <React.Fragment key={hotkey}>
                              <ShortcutKeyboard className="" shortcut={hotkey} />
                              {index < hotkeys.length - 1 && (
                                <span className="text-xs text-muted-foreground"> or </span>
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
      </form>
    </Form>
  );
}
