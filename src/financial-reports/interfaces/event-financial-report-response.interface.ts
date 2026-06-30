import type { EventStatus, EventType, ExpenseCategory } from '../../generated/prisma/enums';

export interface CongregationRevenueRow {
  congregationId: string;
  congregationName: string;
  totalPassengers: number;
  totalExpected: string; // string monetária ("1500.00")
  totalReceived: string;
  totalPending: string;
}

export interface ExpenseCategoryBreakdown {
  category: ExpenseCategory;
  total: string;
  count: number;
}

export interface EventFinancialReportResponse {
  event: {
    id: string;
    title: string;
    type: EventType;
    status: EventStatus;
    ticketPrice: string;
    circuitId: string;
  };
  revenue: {
    totalExpected: string;
    totalReceived: string;
    totalPending: string;
    byCongregation: CongregationRevenueRow[];
  };
  expenses: {
    total: string;
    byCategory: ExpenseCategoryBreakdown[];
  };
  cashBalance: string; // totalReceived − expenses.total (caixa real)
  projectedBalance: string; // totalExpected − expenses.total (resultado projetado)
  generatedAt: Date; // ISO 8601
  generatedByName: string;
}
