import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { toNormalizedEmail } from '../../common/validators/email.transform';
import { CIRCUIT_SIGNUP } from '../circuit-signup.constants';

export class ConfirmCircuitSignupDto {
  @Transform(({ value }) => toNormalizedEmail(value))
  @IsEmail()
  @Length(1, 255)
  email!: string;

  /**
   * As seis caixas da tela chegam como uma string só. Dígitos apenas: o desenho
   * mostra um campo por dígito, e nada garante que o usuário não cole o código
   * com espaço no meio.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @Length(CIRCUIT_SIGNUP.CODE_LENGTH, CIRCUIT_SIGNUP.CODE_LENGTH)
  @Matches(/^\d+$/, { message: 'O código de confirmação tem 6 dígitos' })
  code!: string;
}
