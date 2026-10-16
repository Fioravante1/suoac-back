import { IsString, Length } from 'class-validator';
import { PASSWORD_RESET } from '../password-reset.constants';

export class PasswordResetVerificationDto {
  @IsString()
  @Length(PASSWORD_RESET.TOKEN_HEX_LENGTH, PASSWORD_RESET.TOKEN_HEX_LENGTH)
  token!: string;
}
