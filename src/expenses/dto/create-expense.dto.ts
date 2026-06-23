import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { ExpenseCategory } from '../../generated/prisma/enums';

export class CreateExpenseDto {
  @IsString()
  @Length(1, 300)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(ExpenseCategory)
  category!: ExpenseCategory;

  @IsISO8601()
  incurredAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  observations?: string;
}
