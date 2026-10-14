import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import { AVAILABLE_ICONS } from '@/renderer/app/lib/availableIcons';
import { cn } from '@/renderer/app/lib/utils';
import { useTranslation } from 'react-i18next';

// The icon of a signature or template. A real button (it was a bordered div
// that Tab skipped and nothing marked as clickable), opening a grid of icons
// with the current one marked. The names (code identifiers like "UserGroup")
// are only tooltips now, and still let you type to jump.
export function IconPickerButton({
  value,
  onChange
}: {
  value: string;
  onChange: (icon: MonoIconType) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          typeVariant="icon"
          className="h-10 w-10 shrink-0"
          tooltip={t('settings.change_icon', 'Change icon')}
        >
          <MonoIcon type={value as MonoIconType} className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="grid max-h-64 w-[232px] grid-cols-6 gap-1 overflow-y-auto p-1.5"
      >
        {AVAILABLE_ICONS.map((icon) => (
          <DropdownMenuItem
            key={icon}
            textValue={icon}
            title={icon}
            aria-label={icon}
            onClick={() => onChange(icon)}
            className={cn(
              'h-8 w-8 justify-center p-0',
              value === icon && 'bg-muted-low ring-1 ring-ring'
            )}
          >
            <MonoIcon type={icon} className="h-4 w-4" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
