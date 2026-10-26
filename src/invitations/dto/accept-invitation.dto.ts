import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import {
  FULL_NAME_MESSAGE,
  FULL_NAME_REGEX,
  PERSON_NAME_LENGTH,
  toCollapsedName,
} from '../../common/validators/name.constants';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../common/validators/password.constants';
import { PHONE_DIGITS_MESSAGE, PHONE_DIGITS_REGEX, toPhoneDigits } from '../../common/validators/phone.constants';

/**
 * O convidado confirma nome e celular e escolhe a senha. O e-mail, o papel e a
 * congregação seguem sendo os do convite e não são aceitos aqui: o aceite não
 * pode reatribuir quem a pessoa é nem onde ela entra.
 *
 * Nome e celular são obrigatórios mesmo quando não mudam: o envio é a
 * confirmação dos dados pelo próprio convidado.
 */
export class AcceptInvitationDto {
  @Transform(({ value }) => toCollapsedName(value))
  @IsString()
  @Length(PERSON_NAME_LENGTH.MIN, PERSON_NAME_LENGTH.MAX)
  @Matches(FULL_NAME_REGEX, { message: FULL_NAME_MESSAGE })
  name!: string;

  /**
   * Apenas dígitos, com DDD. A máscara da tela é apresentação: o valor é
   * normalizado antes de validar, pela mesma regra do autocadastro do circuito.
   */
  @Transform(({ value }) => toPhoneDigits(value))
  @IsString()
  @Matches(PHONE_DIGITS_REGEX, { message: PHONE_DIGITS_MESSAGE })
  phone!: string;

  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, { message: PASSWORD_LENGTH_MESSAGE })
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;
}
