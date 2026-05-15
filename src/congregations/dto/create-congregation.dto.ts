import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCongregationDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  city?: string;
}
