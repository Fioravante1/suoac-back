export interface CongregationEventStatusResponse {
  id: string | null;
  status: string;
  congregationId: string;
  congregationName: string;
  eventId: string;
  finalizedById: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
}
