import { IsIn, IsOptional } from 'class-validator';
import type { ExportFormat } from '../export/export.constants';

/** Query param `?format=pdf|xlsx` (default tratado no service como `pdf`). */
export class ExportFormatQueryDto {
  @IsOptional()
  @IsIn(['pdf', 'xlsx'])
  format?: ExportFormat;
}
