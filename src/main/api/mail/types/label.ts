export interface MailLabel {
  id: string;
  name: string;
  color: { textColor?: string; backgroundColor?: string };
}

export interface MailLabelListResponse {
  labels: Record<string, MailLabel[]>;
}

export interface MailLabelCreateResponse {
  id: string;
  name: string;
  color: { textColor?: string; backgroundColor?: string };
}

export interface MailLabelUpdateResponse {
  id: string;
  name: string;
}
