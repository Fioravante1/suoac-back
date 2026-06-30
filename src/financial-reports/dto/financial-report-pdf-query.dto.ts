import { IsIn } from 'class-validator';
import type { FinancialReportForm } from '../financial-reports.service';

/** Query da geração de PDF: `form` obrigatório (s26 | s44). Ausente/ inválido → 400. */
export class FinancialReportPdfQueryDto {
  @IsIn(['s26', 's44'])
  form!: FinancialReportForm;
}
