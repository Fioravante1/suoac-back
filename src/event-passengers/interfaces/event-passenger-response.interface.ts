import type { PaginationMeta } from '../../common/interfaces/paginated-response.interface';

export interface EventPassengerDayResponse {
  id: string;
  eventDayId: string;
  dayNumber: number;
  date: Date;
  label: string;
  checkedIn: boolean;
  checkedInAt: Date | null;
}

export interface EventPassengerResponse {
  id: string;
  passenger: { id: string; name: string; rg: string; phone: string | null };
  totalAmount: string;
  paidAmount: string;
  paymentStatus: string;
  exemptionReason: string | null;
  observations: string | null;
  eventId: string;
  congregationId: string;
  registeredById: string;
  createdAt: Date;
  updatedAt: Date;
  days: EventPassengerDayResponse[];
}

export interface EventPassengerFinancialSummary {
  totalPassengers: number;
  totalExpected: string;
  totalReceived: string;
  totalPending: string;
  byStatus: { paid: number; partial: number; pending: number; exempt: number };
}

export interface PaginatedPassengerResponse {
  data: EventPassengerResponse[];
  meta: PaginationMeta;
  financialSummary: EventPassengerFinancialSummary;
}
