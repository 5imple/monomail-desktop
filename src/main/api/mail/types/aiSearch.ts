import { MailThreadGetResponse } from './thread';

export interface MailSearchQueryRequest {
  prompt: string;
}

export interface MailSearchQuery {
  query: string;
  confidence: number;
  reasoning: string;
}

export interface MailSearchQueryResponse {
  query: string;
  description: string;
}

export interface MailSearchWithThreadsRequest {
  prompt: string;
  pageToken?: string;
  maxResults?: number;
}

export interface MailSearchWithThreadsResponse {
  generatedQueries: MailSearchQuery[];
  selectedQuery: string;
  threads: MailThreadGetResponse[];
  nextPageToken?: string;
}
