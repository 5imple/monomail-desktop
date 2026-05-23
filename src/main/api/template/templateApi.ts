import { apiClient } from '@/main/api/apiClient';
import { localDataStore } from '@/renderer/app/lib/localDataStore';
import { IMonoTemplate, MonoTemplateRequest } from '@/main/api/template/types';

const LS_KEY = 'templates';

const getTemplates = async (): Promise<IMonoTemplate[]> => {
  try {
    const result = await apiClient.get<IMonoTemplate[]>(`/mono/templates`);
    const list = Array.isArray(result) ? result : [];
    localDataStore.set(LS_KEY, list);
    return list;
  } catch {
    return localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  }
};

const addTemplate = async ({ template }: { template: MonoTemplateRequest }): Promise<IMonoTemplate> => {
  const newTemplate: IMonoTemplate = { ...template, icon: template.icon ?? '' };
  const current = localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, [newTemplate, ...current]);
  apiClient.post(`/mono/templates`, template).catch(() => {});
  return newTemplate;
};

const updateTemplate = async (template: IMonoTemplate): Promise<void> => {
  const current = localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, current.map((t) => (t.id === template.id ? template : t)));
  apiClient.put(`/mono/templates/${template.id}`, template).catch(() => {});
};

const deleteTemplate = async ({ templateId }: { templateId: string }): Promise<void> => {
  const current = localDataStore.get<IMonoTemplate[]>(LS_KEY) ?? [];
  localDataStore.set(LS_KEY, current.filter((t) => t.id !== templateId));
  apiClient.delete(`/mono/templates/${templateId}`).catch(() => {});
};

export default {
  getTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate
};
