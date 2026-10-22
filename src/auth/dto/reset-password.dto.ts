import { IsString, Length, Matches } from 'class-validator';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/validators/password.constants';
import { PASSWORD_RESET } from '../password-reset.constants';

export class ResetPasswordDto {
  @IsString()
  @Length(PASSWORD_RESET.TOKEN_HEX_LENGTH, PASSWORD_RESET.TOKEN_HEX_LENGTH)
  token!: string;

  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  newPassword!: string;
}
