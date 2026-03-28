import { apiClient } from '@/main/api/apiClient';
import { IMonoTemplate, MonoTemplateRequest } from '@/main/api/template/types';

/**
 * Get saved templates
 * @returns {Promise<AxiosResponse<IMonoTemplate[]>>} The response from the API
 */
const getTemplates = () => {
  return apiClient.get<IMonoTemplate[]>(`/mono/templates`);
};

/**
 * Add new template
 * @param {MonoTemplateRequest} template - New Template
 * @returns {Promise<void>} - Returns nothing
 */
const addTemplate = ({ template }: { template: MonoTemplateRequest }): Promise<IMonoTemplate> => {
  return apiClient.post(`/mono/templates`, template);
};

/**
 * Update existing template
 * @param {Template} template - New Template
 * @returns {Promise<void>} - Returns nothing
 */
const updateTemplate = (template: IMonoTemplate) => {
  return apiClient.put(`/mono/templates/${template.id}`, template);
};

/**
 * Delete a template
 * @param {string} templateId - The id of the template that user wants to delete
 * @returns {Promise<void>} - Returns nothing
 */
const deleteTemplate = ({ templateId }: { templateId: string }) => {
  return apiClient.delete(`/mono/templates/${templateId}`);
};

export default {
  getTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate
};
