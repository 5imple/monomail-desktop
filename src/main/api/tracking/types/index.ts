export interface TrackingHistory {
  tid: string;
  messageId: string;
  userAgent: string;
  readAt: Date;
  location: string;
}

export type TrackingHistoriesResponse = {
  data: Record<string, Record<string, TrackingHistory[]>>;
};
