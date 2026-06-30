import { IsIn, IsOptional, IsUUID } from 'class-validator';
import type { ExportFormat } from '../../common/export/export.constants';

/**
 * Query do export do extrato de pagamentos: `?format=pdf|xlsx&congregationId=<uuid>`.
 * Sem paginação (export busca o recorte completo, com teto defensivo no service).
 */
export class ExportEventPaymentsQueryDto {
  @IsOptional()
  @IsUUID('4')
  congregationId?: string;

  @IsOptional()
  @IsIn(['pdf', 'xlsx'])
  format?: ExportFormat;
}
