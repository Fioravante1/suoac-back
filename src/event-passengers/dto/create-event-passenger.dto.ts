import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class InitialPaymentDto {
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

export class CreateEventPassengerDto {
  @IsOptional()
  @IsUUID()
  passengerId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[\d.\-xX]{5,14}$/, { message: 'rg deve conter entre 5 e 14 caracteres (dígitos, pontos, hífens ou X)' })
  rg?: string;

  @IsOptional()
  @IsString()
  @Length(8, 20)
  phone?: string;

  @IsOptional()
  @IsUUID('4', { each: true })
  dayIds?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 500)
  observations?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  exemptionReason?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialPaymentDto)
  payment?: InitialPaymentDto;
}
