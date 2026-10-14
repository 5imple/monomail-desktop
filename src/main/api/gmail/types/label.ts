/**
 * Represents a Gmail label.
 */
export interface GmailLabel {
  id: string; // Unique identifier for the label
  name: string; // Name of the label
  color: { textColor?: string; backgroundColor?: string };
}
