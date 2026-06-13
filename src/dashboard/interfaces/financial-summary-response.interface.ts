export interface CongregationFinancialRow {
  congregationId: string;
  congregationName: string;
  totalPassengers: number;
  totalExpected: string;
  totalReceived: string;
  totalPending: string;
  byStatus: { paid: number; partial: number; pending: number; exempt: number };
}

export interface FinancialSummaryResponse {
  eventId: string;
  eventTitle: string;
  ticketPrice: string;
  totals: {
    totalPassengers: number;
    totalExpected: string;
    totalReceived: string;
    totalPending: string;
    byStatus: { paid: number; partial: number; pending: number; exempt: number };
  };
  congregations: CongregationFinancialRow[];
}
