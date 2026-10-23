import { IsString, Length, Matches } from 'class-validator';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/validators/password.constants';

/**
 * O aceite só pede a senha: nome, e-mail, telefone, papel e congregação já
 * vieram no convite.
 */
export class AcceptInvitationDto {
  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;
}
