import { type DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import * as React from 'react';

import ShortcutKeyboard, {
  ShortcutKeyboardProps
} from '@/renderer/app/components/ui/shortcut-keyboard';
import { Dialog, DialogContent } from '@/renderer/app/components/ui/dialog';
import { cn } from '@/renderer/app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { buttonVariants } from '@/renderer/app/components/ui/button';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-card text-card-foreground dark:bg-card',
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

interface CommandDialogProps extends DialogProps {}

const CommandDialog = ({ children, ...props }: CommandDialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0 shadow-lg" aria-describedby="">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

interface CommandInputProps extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> {
  prepend?: React.ReactNode;
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  CommandInputProps
>(({ className, prepend, ...props }, ref) => (
  <div className="flex items-center" cmdk-input-wrapper="">
    {/* <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" /> */}
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'm-3 flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
    {prepend ?? <ShortcutKeyboard shortcut={'ESC'} className="px-2" />}
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty ref={ref} className="w-full py-6 text-center text-sm" {...props} />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandLoading = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Loading>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Loading>
>((props, ref) => (
  <CommandPrimitive.Loading ref={ref} className="py-6 text-center text-sm" {...props} />
));
CommandLoading.displayName = CommandPrimitive.Loading.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className
    )}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const commandItemVariants = cva(cn(''), {
  variants: {
    variant: {
      default: '',
      raycast:
        'rounded-lg p-2.5 border-transparent data-[selected=true]:bg-muted data-[selected=true]:border-primary/5 text-sm font-medium',
      arc: 'rounded-lg p-3.5 border-transparent data-[selected=true]:text-primary-foreground data-[selected=true]:bg-primary dark:data-[selected=true]:bg-primary/80 data-[selected=true]:border-primary/5 text-sm',
      mono: 'rounded-none p-4  border-l-4 border-transparent data-[selected=true]:bg-primary/20 data-[selected=true]:border-primary'
    }
  }
});

export interface CommandItemProps
  extends React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>,
    VariantProps<typeof commandItemVariants> {}

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  CommandItemProps
>(({ className, variant, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "group relative flex cursor-default select-none items-center rounded-lg px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected='true']:bg-muted data-[selected=true]:text-foreground data-[disabled=true]:opacity-50",
      commandItemVariants({ variant }),
      className
    )}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({ ...props }: ShortcutKeyboardProps) => {
  return (
    <ShortcutKeyboard
      className="ml-auto"
      keyboardClassName="bg-muted group-data-[selected='true']:text-foreground font-medium"
      {...props}
    />
  );
};
CommandShortcut.displayName = 'CommandShortcut';

export interface CommandIconProps {
  type: MonoIconType;
  className?: string;
}
const CommandIcon: React.FC<CommandIconProps> = ({ type, className }) => {
  return (
    <div
      className={cn(
        buttonVariants({ variant: 'secondary' }),
        'mr-3 h-8 w-8 overflow-hidden rounded-md border p-1 text-muted-foreground',
        'group-data-[selected=true]:text-foreground',
        className
      )}
    >
      <MonoIcon type={type} />
    </div>
  );
};

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut,
  CommandIcon
};
