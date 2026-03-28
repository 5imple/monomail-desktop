export interface MailHistoryListResponse {
  history: MailHistory[] | null;
  nextPageToken?: string;
  historyId: string;
}

export interface MailHistory {
  messagesAdded: MailHistoryMessage[];
  messagesDeleted: MailHistoryMessage[];
  labelsAdded: MailHistoryLabel[];
  labelsRemoved: MailHistoryLabel[];
}

export interface MailHistoryMessage {
  id: string;
  threadId: string;
}

export interface MailHistoryLabel {
  id: string;
  threadId: string;
  labelIds: string[];
}
