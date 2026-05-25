import { localDataStore } from '@/renderer/app/lib/localDataStore';
import { IMonoTemplate, MonoTemplateRequest } from '@/main/api/template/types';

// Standalone: templates live entirely in local storage (no backend).
const LS_KEY = 'templates';

const getTemplates = async (): Promise<IMonoTemplate[]> => {
  return localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
};

const addTemplate = async ({
  template
}: {
  template: MonoTemplateRequest;
}): Promise<IMonoTemplate> => {
  const newTemplate: IMonoTemplate = { ...template, icon: template.icon ?? '' };
  const current = localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, [newTemplate, ...current]);
  return newTemplate;
};

const updateTemplate = async (template: IMonoTemplate): Promise<void> => {
  const current = localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  localDataStore.set(
    LS_KEY,
    current.map((t) => (t.id === template.id ? template : t))
  );
};

const deleteTemplate = async ({ templateId }: { templateId: string }): Promise<void> => {
  const current = localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  localDataStore.set(
    LS_KEY,
    current.filter((t) => t.id !== templateId)
  );
};

export default {
  getTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate
};
