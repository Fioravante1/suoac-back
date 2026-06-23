/** Uma linha de receita consolidada por congregação (ENTRADA). */
export interface FinancialReportRevenueLine {
  congregationName: string;
  received: string; // "NN.NN"
}

/** Uma linha de despesa (SAÍDA). */
export interface FinancialReportExpenseLine {
  date: string; // dd/mm/aaaa
  description: string;
  amount: string; // "NN.NN"
}

/**
 * Dados para preencher os formulários oficiais S-26 (Folha de Contas) e S-44
 * (Relatório Mensal de Contas). Valores monetários em string "NN.NN" (pt-BR é
 * aplicado no preenchimento). A camada de dados é a mesma; muda só o documento.
 */
export interface FinancialReportPdfData {
  eventTitle: string;
  city: string;
  state: string;
  eventDates: string; // ex.: "13 a 15/06/2026" (ou "—" se sem dias)
  monthYearLabel: string; // S-44 "Mês/Ano"
  revenueByCongregation: FinancialReportRevenueLine[];
  expenses: FinancialReportExpenseLine[];
  totalReceived: string;
  totalExpenses: string;
  balance: string; // totalReceived − totalExpenses (pode ser negativo)
}
