import { IsString, Length, Matches } from 'class-validator';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/validators/password.constants';

export class ChangePasswordDto {
  @IsString()
  @Length(1, 100)
  currentPassword!: string;

  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  newPassword!: string;
}
