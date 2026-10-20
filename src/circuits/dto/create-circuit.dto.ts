import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateCircuitDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 20)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: 'state deve ter exatamente 2 caracteres (ex: SP, RJ)' })
  state!: string;
}
