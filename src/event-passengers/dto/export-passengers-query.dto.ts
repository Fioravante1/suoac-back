import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ExportPassengersQueryDto {
  @IsOptional()
  @IsUUID()
  congregationId?: string;

  /**
   * Inclui o RG no PDF. Parsing estrito: aceita apenas 'true'/'false'; qualquer
   * outro valor é preservado para que o @IsBoolean() o rejeite com 400 (em vez
   * de ser silenciosamente convertido em false).
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return value;
  })
  includeSensitive?: boolean;
}
