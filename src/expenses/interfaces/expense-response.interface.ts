import type { PaginatedResponse, PaginationMeta } from '../../common/interfaces/paginated-response.interface';
import type { ExpenseCategory } from '../../generated/prisma/enums';

export interface ExpenseResponse {
  id: string;
  description: string;
  amount: string; // Decimal → string ("1500.00")
  category: ExpenseCategory;
  incurredAt: Date; // ISO 8601
  observations: string | null;
  eventId: string;
  registeredById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventExpensesResponse extends PaginatedResponse<ExpenseResponse> {
  meta: PaginationMeta & { totalExpenses: string }; // agregado _sum.amount do recorte (default "0.00")
}
