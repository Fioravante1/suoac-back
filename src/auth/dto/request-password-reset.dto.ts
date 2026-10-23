import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { toNormalizedEmail } from '../../common/validators/email.transform';

export class RequestPasswordResetDto {
  @Transform(({ value }) => toNormalizedEmail(value))
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
