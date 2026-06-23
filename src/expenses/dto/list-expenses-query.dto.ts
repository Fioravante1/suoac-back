import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ExpenseCategory } from '../../generated/prisma/enums';

export class ListExpensesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  /** Filtro inclusivo: incurredAt >= from */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Filtro inclusivo: incurredAt <= to */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
