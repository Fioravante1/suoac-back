import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreatePassengerDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[\d.\-xX]{5,14}$/, { message: 'rg deve conter entre 5 e 14 caracteres (dígitos, pontos, hífens ou X)' })
  rg!: string;

  @IsOptional()
  @IsString()
  @Length(8, 20)
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  observations?: string;
}
