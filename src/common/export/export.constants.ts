/** Formatos de exportação suportados. */
export type ExportFormat = 'pdf' | 'xlsx';

export const PDF_CONTENT_TYPE = 'application/pdf';
export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Teto defensivo de linhas para o extrato de pagamentos exportado (sem paginação).
 * Acima deste limite, o export é bloqueado com 422 e o usuário é orientado a filtrar
 * por congregação. Evita gerar arquivos gigantes / estourar memória.
 */
export const FINANCIAL_EXPORT_MAX_ROWS = 5000;

/**
 * Teto defensivo de passageiros por exportação da listagem de inscritos (PDF ou XLSX),
 * sem paginação. Acima deste limite, o export é bloqueado com 422 e o usuário é orientado
 * a filtrar por congregação. Volume esperado por evento: 200–800 inscritos.
 */
export const PASSENGER_LIST_EXPORT_MAX_PASSENGERS = 2000;
