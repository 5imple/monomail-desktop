export type LabelColor = {
  textColor: string;
  backgroundColor: string;
};

// Predefined colors for labels
export const LABEL_COLORS: Record<string, LabelColor> = {
  RED: { textColor: '#83334c', backgroundColor: '#f6c5be' },
  GRAY: { textColor: '#464646', backgroundColor: '#e7e7e7' },
  GREEN: { textColor: '#0b4f30', backgroundColor: '#c6f3de' },
  // b9e4d0
  ORANGE: { textColor: '#822111', backgroundColor: '#ffe6c7' },
  YELLOW: { textColor: '#a46a21', backgroundColor: '#a46a21' },
  PURPLE: { textColor: '#3d188e', backgroundColor: '#e3d7ff' },
  BLUE: { textColor: '#1c4587', backgroundColor: '#c9daf8' },
  PINK: { textColor: '#711a36', backgroundColor: '#fcdee8' },
  BLACK: { textColor: '#f3f3f3', backgroundColor: '#000000' }
};

export interface MonoLabelTemplate {
  name: string;
  color: LabelColor;
}
export const MONO_LABEL_TEMPLATES: MonoLabelTemplate[] = [
  { name: 'Mono', color: LABEL_COLORS.GRAY },
  { name: 'Mono/Needs Reply', color: LABEL_COLORS.RED },
  { name: 'Mono/Cold Outreach', color: LABEL_COLORS.ROSE },
  { name: 'Mono/Meetings', color: LABEL_COLORS.BLUE }, // indigo
  { name: 'Mono/Team Updates', color: LABEL_COLORS.BLUE },
  { name: 'Mono/Promotions', color: LABEL_COLORS.ROSE }, // PINK
  { name: 'Mono/Transactional', color: LABEL_COLORS.GRAY },
  { name: 'Mono/To Do', color: LABEL_COLORS.GREEN }, // TEAL
  { name: 'Mono/Code Reviews', color: LABEL_COLORS.GREEN }, // EMERALD
  { name: 'Mono/Deployments', color: LABEL_COLORS.GREEN },
  { name: 'Mono/Tech News', color: LABEL_COLORS.PURPLE },
  { name: 'Mono/Account Alerts', color: LABEL_COLORS.RED },
  { name: 'Mono/Investment Updates', color: LABEL_COLORS.ORANGE }, // YELLOW
  { name: 'Mono/Statements', color: LABEL_COLORS.GRAY },
  { name: 'Mono/Crypto', color: LABEL_COLORS.PURPLE },
  { name: 'Mono/Assignments', color: LABEL_COLORS.ORANGE },
  { name: 'Mono/Course Updates', color: LABEL_COLORS.BLUE },
  { name: 'Mono/Grades', color: LABEL_COLORS.GREEN },
  { name: 'Mono/Learning Resources', color: LABEL_COLORS.BLUE }, // indigo
  { name: 'Mono/Design Updates', color: LABEL_COLORS.PURPLE }, // VIOLET
  { name: 'Mono/Design Review', color: LABEL_COLORS.ROSE }, // PINK
  { name: 'Mono/Asset Requests', color: LABEL_COLORS.GREEN }, // TEAL
  { name: 'Mono/Client Feedback', color: LABEL_COLORS.ROSE },
  { name: 'Mono/Newsletter Feedback', color: LABEL_COLORS.ROSE },
  { name: 'Mono/Campaign Performance', color: LABEL_COLORS.ORANGE },
  { name: 'Mono/Launch Replies', color: LABEL_COLORS.BLUE },
  { name: 'Mono/Vendor Pitches', color: LABEL_COLORS.ROSE }, // PINK
  { name: 'Mono/Tool Invoices', color: LABEL_COLORS.GRAY },
  { name: 'Mono/Policy Updates', color: LABEL_COLORS.BLACK },
  { name: 'Mono/Access Requests', color: LABEL_COLORS.GREEN }, // TEAL
  { name: 'Mono/HR Notices', color: LABEL_COLORS.ORANGE }, // YELLOW
  { name: 'Mono/Digest', color: LABEL_COLORS.BLUE }, // indigo
  { name: 'Mono/Blog Updates', color: LABEL_COLORS.PURPLE }, // VIOLET
  { name: 'Mono/Saved Articles', color: LABEL_COLORS.BLUE },
  { name: 'Mono/Feature Article', color: LABEL_COLORS.PURPLE },
  { name: 'Mono/To Do', color: LABEL_COLORS.ORANGE },
  { name: 'Mono/Personal', color: LABEL_COLORS.GRAY },
  { name: 'Mono/Reminder', color: LABEL_COLORS.ORANGE }, // YELLOW
  { name: 'Mono/FYI', color: LABEL_COLORS.GRAY },
  { name: 'Mono/Newsletter', color: LABEL_COLORS.BLUE }, // indigo
  { name: 'Mono/Receipt', color: LABEL_COLORS.GREEN },
  { name: 'Mono/Security', color: LABEL_COLORS.RED },
  { name: 'Mono/Support', color: LABEL_COLORS.BLUE },
  { name: 'Mono/Others', color: LABEL_COLORS.BLACK }
];
