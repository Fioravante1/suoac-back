import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

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
}
