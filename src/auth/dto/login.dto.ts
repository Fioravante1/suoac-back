import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { toNormalizedEmail } from '../../common/validators/email.transform';

export class LoginDto {
  @Transform(({ value }) => toNormalizedEmail(value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(1, 100)
  password!: string;
}
