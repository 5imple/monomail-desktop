import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
} from '@/renderer/app/components/ui/dialog';
import SettingsLayout from '@/renderer/app/containers/settings/SettingsLayout';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';

interface PreferanceDialogProps {
  children?: React.ReactNode;
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  defaultPage?: string;
}

const PreferanceDialog: FC<PreferanceDialogProps> = ({
  children,
  open,
  onOpenChange,
  defaultPage = 'general'
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay className="dark" />
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 dark:border sm:max-w-[1080px] [&>button.absolute]:z-10"
          // Keys pressed in Settings stay in Settings: the app's document-level
          // hotkeys swallowed Tab and arrows, and E/S/U/Z/Backspace/Enter acted
          // on the inbox behind the dialog. Escape is left alone (Radix closes
          // menus and the dialog with it), and nothing is preventDefault-ed.
          onKeyDown={(e) => {
            if (e.key !== 'Escape') e.stopPropagation();
          }}
          // Start on the page that opened, not always on "General" (whose focus
          // ring made two items look selected).
          onOpenAutoFocus={(e) => {
            const active = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
              'nav [data-active]'
            );
            if (!active) return;
            e.preventDefault();
            active.focus({ preventScroll: true });
          }}
        >
          <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
          <SettingsLayout defaultPage={defaultPage} />
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
};

export default PreferanceDialog;
