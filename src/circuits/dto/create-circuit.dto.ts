import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateCircuitDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
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
