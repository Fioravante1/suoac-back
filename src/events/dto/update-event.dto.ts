import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  ticketPrice?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  registrationDeadline?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  paymentDeadline?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 200)
  venue?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 300)
  address?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  city?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
