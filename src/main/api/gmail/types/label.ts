/**
 * Represents a Gmail label.
 */
export interface GmailLabel {
  id: string; // Unique identifier for the label
  name: string; // Name of the label
  color: { textColor?: string; backgroundColor?: string };
}

/**
 * Response for fetching a list of Gmail labels.
 */
export interface GmailLabelListResponse {
  labels: Record<string, GmailLabel[]>; // Array of Gmail labels
}

/**
 * Response for creating a Gmail label.
 */
export interface GmailLabelCreateResponse {
  id: string; // Unique identifier for the created label
  name: string; // Name of the created label
  color: { textColor?: string; backgroundColor?: string };
}

/**
 * Response for updating a Gmail label.
 */
export interface GmailLabelUpdateResponse {
  id: string; // Unique identifier for the updated label
  name: string; // Updated name of the label
}
