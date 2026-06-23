import { IsIn, IsOptional } from 'class-validator';

/**
 * Query do relatório financeiro. Na Fase 4a só há `format=json` (default). A Fase 4b
 * estende com `form=s26|s44` e `format=pdf` sem alterar a assinatura do controller.
 */
export class FinancialReportQueryDto {
  @IsOptional()
  @IsIn(['json'])
  format?: 'json';
}
