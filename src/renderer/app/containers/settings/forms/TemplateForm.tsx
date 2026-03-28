import templateApi from '@/main/api/template/templateApi';
import { IMonoTemplate } from '@/main/api/template/types';
import MonoIcon, { MonoIconType } from '@/renderer/app/components/icons/icons';
import { Button } from '@/renderer/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/renderer/app/components/ui/dropdown-menu';
import TemplateEditDialog from '@/renderer/app/containers/dialog/TemplateEditDialog';
import { useUserTrackingData } from '@/renderer/app/hooks/useUserTrackingData';
import { getPlainTextSnippet } from '@/renderer/app/lib/getPlainTextSnippet';
import { cn } from '@/renderer/app/lib/utils';
import { useTemplateAtom } from '@/renderer/app/store/compose/useTemplateAtom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form } from 'react-router-dom';
import { toast } from 'sonner';

const TemplateForm = () => {
  const { templates, addTemplate, removeTemplateById, updateTemplateById } = useTemplateAtom();
  const { trackEvent } = useUserTrackingData();
  // const templates = ALL_TEMPLATES;
  const { t } = useTranslation();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const openAddDialog = () => {
    setSelectedTemplate(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (template) => {
    setSelectedTemplate(template);
    setIsDialogOpen(true);
  };

  const handleSaveTemplate = async (data: IMonoTemplate) => {
    try {
      if (data.id && templates.some((t) => t.id === data.id)) {
        // Update existing template
        trackEvent('template_update', {
          includesVariable: data.body.includes('{') && data.body.includes('}')
        });
        await templateApi.updateTemplate({
          id: data.id,
          subject: data.subject,
          body: data.body,
          name: data.name,
          icon: data.icon // Add icon to the update
        });
        updateTemplateById(data.id, data);
        toast.success(t('settings.template.template_updated'));
      } else {
        // Add new template
        trackEvent('template_add', {
          includesVariable: data.body.includes('{') && data.body.includes('}')
        });
        await templateApi.addTemplate({ template: data });
        addTemplate(data);
        toast.success(t('settings.template.template_added'));
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(t('settings.template.template_save_error'));
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await templateApi.deleteTemplate({ templateId: id });
      removeTemplateById(id);
      toast.success(t('settings.template.template_deleted'));
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error(t('settings.template.template_delete_error'));
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="mb-4 flex items-start">
          <div>
            <h3 className="text-lg font-medium">{t('settings.template.title')}</h3>
            <p className="text-sm text-muted-foreground">{t('settings.template.description')}</p>
          </div>
          <Button className="ml-auto" variant="secondary" onClick={openAddDialog} type="button">
            <MonoIcon type="Plus" className="mr-2" />
            {t('settings.template.add_template')}
          </Button>
        </div>

        <div className="overflow-hidden rounded-md border shadow-sm">
          <div className="flex gap-1 border-b bg-muted px-2 py-2">
            <div className="ml-2 basis-14 text-sm text-muted-foreground">{`${t('settings.template.icon')}`}</div>{' '}
            {/* Column for icon */}
            <div className="basis-32 text-sm text-muted-foreground">
              {`${t('settings.template.template_name')}`}
            </div>
            <div className="flex-1 text-sm text-muted-foreground">
              {t('settings.template.body')}
            </div>
          </div>
          {templates.length === 0 ? (
            <div className="p-2.5 text-center text-sm text-muted-foreground">
              {t('settings.template.no_templates')}
            </div>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center gap-1 overflow-hidden border-b p-2 py-1 last:border-0"
              >
                {/* Icon column */}
                <div
                  className={cn('mx-3 flex basis-10 items-center justify-start text-primary/80')}
                >
                  {template.icon && <MonoIcon type={template.icon as MonoIconType} />}
                </div>

                <div className="basis-32 overflow-hidden text-ellipsis text-sm">
                  <span className="whitespace-nowrap">
                    <span className="text-muted-foreground">/ </span>
                    {template.name}
                  </span>
                </div>

                <div className="flex-1 overflow-hidden text-ellipsis">
                  <span className="line-clamp-1 text-sm text-muted-foreground">
                    {getPlainTextSnippet(template.body) || t('settings.template.no_body')}
                  </span>
                </div>
                <div className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        sizeVariant="sm"
                        typeVariant="icon"
                        className="h-8 w-8 p-0"
                      >
                        <MonoIcon type="MoreHorizontal" className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(template)}>
                        <MonoIcon type="Edit" className="mr-2 h-4 w-4" />
                        <span>{t('settings.template.edit_template')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <MonoIcon type="Trash" className="mr-2 h-4 w-4" />
                        <span>{t('settings.template.remove_template')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <TemplateEditDialog
        template={selectedTemplate}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleSaveTemplate}
      />
    </>
  );
};

export default TemplateForm;
