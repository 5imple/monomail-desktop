import MonoIcon from '@/renderer/app/components/icons/icons';
import { Label } from '@/renderer/app/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/app/components/ui/popover';
import { Separator } from '@/renderer/app/components/ui/separator';
import electronApi from '@/renderer/app/lib/electronApi';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { PopoverClose } from '@radix-ui/react-popover';
import React, { FC } from 'react';

interface TemplateSwitcherProps {
  children?: React.ReactNode;
  onTemplateChange?: (templateId: string) => void;
}

const TemplateSwitcher: FC<TemplateSwitcherProps> = ({ children, onTemplateChange }) => {
  const { templates } = useTemplateAtom();

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="no-drag dark ml-2 p-0">
        <div className="p-2 pb-0">
          <Label>Templates</Label>
        </div>

        <div className="flex-1 p-1.5">
          <PopoverClose asChild>
            {templates && templates.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="flex w-full items-center rounded-md p-2 text-sm text-foreground transition-colors duration-100 hover:bg-muted"
                    onClick={() => onTemplateChange && onTemplateChange(template.id)}
                  >
                    <MonoIcon type={'FileText'} className="mr-2" />
                    {template.name.length > 0 ? template.name : '(Untitled)'}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-2">
                <div className="text-start text-sm text-foreground">No templates found</div>
              </div>
            )}
          </PopoverClose>
        </div>
        <Separator />
        {/* Signature manage modal */}
        <div className="flex-1 p-1.5">
          <PopoverClose asChild>
            <ul className="space-y-0">
              <button
                onClick={() => {
                  electronApi.triggerCommand('OPEN_PREFERENCES_TEMPLATE');
                }}
                className="flex w-full items-center rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-muted-low"
              >
                <MonoIcon type={'Cog'} className="mr-2" />
                Manage templates
              </button>
            </ul>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TemplateSwitcher;
