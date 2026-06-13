import { IsISO8601, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsISO8601()
  paidAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  observations?: string;
}
