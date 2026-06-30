/**
 * Estruturas de dados para exportação financeira (PDF/XLSX). Definidas em `common`
 * (desacopladas das features) e consumidas por `PdfService` e `XlsxService`. Os
 * services de domínio (Dashboard/Payments) montam estes shapes a partir das suas
 * agregações — os tipos das features são estruturalmente compatíveis com estes.
 */

export interface FinancialExportStatusBreakdown {
  paid: number;
  partial: number;
  pending: number;
  exempt: number;
}

export interface FinancialExportTotals {
  totalPassengers: number;
  totalExpected: string;
  totalReceived: string;
  totalPending: string;
  byStatus: FinancialExportStatusBreakdown;
}

export interface FinancialExportCongregationRow {
  congregationName: string;
  totalPassengers: number;
  totalExpected: string;
  totalReceived: string;
  totalPending: string;
  byStatus: FinancialExportStatusBreakdown;
}

export interface FinancialSummaryExportData {
  eventTitle: string;
  generatedAt: Date;
  generatedByName: string;
  totals: FinancialExportTotals;
  congregations: FinancialExportCongregationRow[];
}

export interface PaymentsExtractRow {
  paidAt: Date;
  passengerName: string;
  congregationName: string;
  amount: string; // "NN.NN"
  observations: string | null;
}

export interface PaymentsExtractExportData {
  eventTitle: string;
  generatedAt: Date;
  generatedByName: string;
  congregationName: string | null; // presente quando filtrado por uma congregação
  rows: PaymentsExtractRow[];
  totalReceived: string; // "NN.NN"
}

/** Resultado padrão de uma exportação binária (consumido pelos controllers `@Res()`). */
export interface ExportFileResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}
