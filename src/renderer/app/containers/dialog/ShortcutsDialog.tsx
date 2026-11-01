import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle
} from '@/renderer/app/components/ui/dialog';
import ShortcutKeyboard from '@/renderer/app/components/ui/shortcut-keyboard';
import { ShortcutForm } from '@/renderer/app/containers/settings/forms/ShortcutForm';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Every keyboard shortcut on one sheet, over whatever is on screen (? or ⌘/,
 * as in Superhuman). It used to open the whole Settings dialog on its
 * Shortcuts page.
 */
const ShortcutsDialog: FC<ShortcutsDialogProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent className="max-h-[80vh] gap-0 overflow-y-auto p-0 sm:max-w-[640px]">
          <DialogHeader className="sticky top-0 z-10 border-b bg-background px-6 py-4">
            <DialogTitle>
              {t('dialog.shortcuts.title', { defaultValue: 'Keyboard shortcuts' })}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              {t('dialog.shortcuts.hint', { defaultValue: 'Open this list any time with' })}
              <ShortcutKeyboard shortcut="?" />
              {t('settings.shortcut.or', 'or')}
              <ShortcutKeyboard shortcut="MOD+SLASH" />
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5">
            <ShortcutForm />
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default ShortcutsDialog;
