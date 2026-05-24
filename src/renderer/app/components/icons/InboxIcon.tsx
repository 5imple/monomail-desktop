import React, { memo, useMemo } from 'react';
import type { MaterialSymbol } from 'material-symbols';
import 'material-symbols/rounded.css';

import type { MonoIconType } from '@/renderer/app/components/icons/icons';
import { cn } from '@/renderer/app/lib/utils';

export type { MonoIconType };
export type InboxIconType = MonoIconType | MaterialSymbol;

export interface InboxIconProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  type?: InboxIconType;
  symbol?: MaterialSymbol;
  fill?: boolean;
  size?: number;
  label?: string;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  grade?: -25 | 0 | 200;
  opticalSize?: 20 | 24 | 40 | 48;
}

const ICON_MAP: Partial<Record<MonoIconType, MaterialSymbol>> = {
  AlertCircle: 'error',
  AcademicCap: 'school',
  Airplane: 'flight',
  Archive: 'archive',
  ArchiveRestore: 'restore_from_trash',
  ArchiveX: 'inventory_2',
  Banknotes: 'payments',
  Beaker: 'science',
  Bell: 'notifications',
  Bookmark: 'bookmark',
  Book: 'book',
  Bolt: 'bolt',
  Briefcase: 'work',
  Building: 'corporate_fare',
  Cake: 'cake',
  Calendar: 'calendar_month',
  ChatBubble: 'chat_bubble',
  Check: 'check',
  CheckCheck: 'done_all',
  CheckCircle: 'check_circle',
  ChevronDown: 'keyboard_arrow_down',
  ChevronLeft: 'chevron_left',
  ChevronRight: 'chevron_right',
  ChevronUp: 'keyboard_arrow_up',
  ChevronsLeft: 'keyboard_double_arrow_left',
  ChevronsRight: 'keyboard_double_arrow_right',
  Clock: 'schedule',
  Cloud: 'cloud',
  Cog: 'settings',
  Coffee: 'coffee',
  Copy: 'content_copy',
  Download: 'download',
  Dropdown: 'keyboard_arrow_down',
  Edit: 'edit_square',
  Envelope: 'mail',
  EnvelopeOpen: 'drafts',
  EnvelopeStack: 'all_inbox',
  Eye: 'visibility',
  EyeSlash: 'visibility_off',
  FileArchive: 'folder_zip',
  FileAudio: 'audio_file',
  FileImage: 'image',
  FileMinus: 'file_present',
  FileQuestion: 'unknown_document',
  FileText: 'description',
  FileVideo: 'videocam',
  Filter: 'filter_list',
  Fire: 'local_fire_department',
  Folder: 'folder',
  FolderOpen: 'folder_open',
  Forward: 'forward',
  Gift: 'redeem',
  Globe: 'public',
  GoogleCalendar: 'event',
  Heart: 'favorite',
  HelpCircle: 'help',
  Home: 'home',
  Inbox: 'inbox',
  InboxStack: 'all_inbox',
  Label: 'label',
  LightBulb: 'lightbulb',
  MailSearch: 'search',
  Maximize: 'open_in_full',
  Megaphone: 'campaign',
  Menu: 'menu',
  Minimize: 'close_fullscreen',
  Mono: 'circle',
  Moon: 'dark_mode',
  MoreHorizontal: 'more_horiz',
  MoreVertical: 'more_vert',
  Music: 'library_music',
  Newsletter: 'newsmode',
  Paperclip: 'attach_file',
  Pen: 'edit',
  Phone: 'call',
  Pin: 'keep',
  Planet: 'planet',
  Plus: 'add',
  Radio: 'radio',
  Reply: 'reply',
  RotateCcw: 'rotate_left',
  Rocket: 'rocket_launch',
  Search: 'search',
  Send: 'send',
  SendHorizontal: 'send',
  ShoppingBag: 'shopping_bag',
  ShoppingCart: 'shopping_cart',
  Shield: 'shield',
  Star: 'star',
  Tag: 'sell',
  Terminal: 'terminal',
  Ticket: 'confirmation_number',
  Trash: 'delete',
  TrashRestore: 'restore_from_trash',
  Trophy: 'trophy',
  Truck: 'local_shipping',
  UserGroup: 'groups',
  UserIcon: 'account_circle',
  Variable: 'data_object',
  Workspace: 'workspace_premium',
  X: 'close',
  XCircle: 'cancel'
};

const SIZE_FROM_CLASS: Array<[RegExp, number]> = [
  [/\bh-3\b|\bw-3\b/, 16],
  [/\bh-3\.5\b|\bw-3\.5\b/, 17],
  [/\bh-4\b|\bw-4\b/, 18],
  [/\bh-5\b|\bw-5\b/, 20],
  [/\bh-6\b|\bw-6\b/, 24],
  [/\bh-8\b|\bw-8\b/, 32]
];

const SIZE_CLASS_PATTERN = /\b(?:h|w)-(?:\[[^\]]+\]|[^\s]+)/g;

const inferSize = (className?: string) => {
  if (!className) return 18;
  return SIZE_FROM_CLASS.find(([pattern]) => pattern.test(className))?.[1] ?? 18;
};

const stripSizeClasses = (className?: string) => className?.replace(SIZE_CLASS_PATTERN, '').trim();

const resolveSymbol = (type?: InboxIconType, symbol?: MaterialSymbol): MaterialSymbol => {
  if (symbol) return symbol;
  if (!type) return 'help';
  return ICON_MAP[type as MonoIconType] ?? (type as MaterialSymbol);
};

const InboxIcon = memo<InboxIconProps>(
  ({
    type,
    symbol,
    fill = false,
    size,
    label,
    weight = 300,
    grade = 0,
    opticalSize,
    className,
    style,
    ...props
  }) => {
    const iconSize = size ?? inferSize(className);
    const resolvedSymbol = resolveSymbol(type, symbol);
    const cleanedClassName = useMemo(() => stripSizeClasses(className), [className]);

    return (
      <span
        aria-hidden={label ? undefined : true}
        aria-label={label}
        role={label ? 'img' : undefined}
        className={cn(
          'material-symbols-rounded inline-flex shrink-0 select-none items-center justify-center overflow-visible align-middle leading-none',
          cleanedClassName
        )}
        style={{
          width: iconSize,
          height: iconSize,
          fontSize: iconSize,
          fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize ?? Math.min(Math.max(iconSize, 20), 48)}`,
          ...style
        }}
        {...props}
      >
        {resolvedSymbol}
      </span>
    );
  }
);

InboxIcon.displayName = 'InboxIcon';

export default InboxIcon;
