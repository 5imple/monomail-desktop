export interface IMonoTemplate {
  id: string;
  name: string;
  subject?: string;
  body: string;
  icon: string;
}

export interface MonoTemplateRequest {
  id: string;
  name: string;
  subject?: string;
  body: string;
  icon?: string;
}
