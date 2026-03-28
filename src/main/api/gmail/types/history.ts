export interface GmailHistoryListResponse {
  history: GmailHistory[] | null;
  nextPageToken?: string;
  historyId: string;
}

export interface GmailHistory {
  messagesAdded: GmailHistoryMessage[];
  messagesDeleted: GmailHistoryMessage[];
  labelsAdded: GmailHistoryLabel[];
  labelsRemoved: GmailHistoryLabel[];
}

export interface GmailHistoryMessage {
  id: string;
  threadId: string;
}

export interface GmailHistoryLabel {
  id: string;
  threadId: string;
  labelIds: string[];
}
