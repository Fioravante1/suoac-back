import type { PaginatedResponse, PaginationMeta } from '../../common/interfaces/paginated-response.interface';

export interface EventPaymentRow {
  id: string;
  amount: string; // Decimal → string ("50.00")
  paidAt: Date; // ISO 8601
  observations: string | null;
  eventPassengerId: string;
  passengerName: string;
  congregationId: string;
  congregationName: string;
  registeredById: string;
  createdAt: Date;
}

export interface EventPaymentsResponse extends PaginatedResponse<EventPaymentRow> {
  meta: PaginationMeta & { totalReceived: string }; // agregado do recorte
}
