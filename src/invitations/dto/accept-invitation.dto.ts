import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/validators/password.constants';

/**
 * O convidado confirma nome e celular e escolhe a senha. O e-mail, o papel e a
 * congregação seguem sendo os do convite e não são aceitos aqui: o aceite não
 * pode reatribuir quem a pessoa é nem onde ela entra.
 *
 * Nome e celular são obrigatórios mesmo quando não mudam: o envio é a
 * confirmação dos dados pelo próprio convidado.
 */
export class AcceptInvitationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString()
  @Length(2, 150)
  @Matches(/^\S+(\s\S+)+$/, { message: 'Informe nome e sobrenome' })
  name!: string;

  /**
   * Apenas dígitos, com DDD. A máscara da tela é apresentação: o valor é
   * normalizado antes de validar, como no autocadastro do circuito.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'O celular deve ter DDD e 8 ou 9 dígitos' })
  phone!: string;

  @IsString()
  @Length(8, 100)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;
}
