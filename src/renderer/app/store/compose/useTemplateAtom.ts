import { IMonoTemplate } from '@/main/api/template/types';
import { atom, useAtom } from 'jotai';

const defaultTemplates = atom<IMonoTemplate[]>([]);

export function useTemplateAtom() {
  const [templates, setTemplates] = useAtom(defaultTemplates);

  const updateTemplateById = (id: string, updatedFields: Partial<IMonoTemplate>) => {
    setTemplates((prevTemplates) =>
      prevTemplates.map((template) =>
        template.id === id ? { ...template, ...updatedFields } : template
      )
    );
  };

  const removeTemplateById = (id: string) => {
    setTemplates((prevTemplates) => prevTemplates.filter((template) => template.id !== id));
  };

  const addTemplate = (newTemplate: IMonoTemplate) => {
    setTemplates((prevTemplates) => [newTemplate, ...prevTemplates]);
  };

  return {
    templates,
    setTemplates,
    updateTemplateById,
    removeTemplateById,
    addTemplate
  };
}
