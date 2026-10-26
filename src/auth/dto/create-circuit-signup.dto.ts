import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { toNormalizedEmail } from '../../common/validators/email.transform';
import { PERSON_NAME_LENGTH } from '../../common/validators/name.constants';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../common/validators/password.constants';
import { PHONE_DIGITS_MESSAGE, PHONE_DIGITS_REGEX, toPhoneDigits } from '../../common/validators/phone.constants';
import { TERMS_VERSION_MESSAGE, TERMS_VERSION_REGEX } from '../../common/validators/terms.constants';
import { toTrimmed } from '../../common/validators/text.transform';
import { CIRCUIT_SIGNUP } from '../circuit-signup.constants';

/**
 * As classes aninhadas vivem neste arquivo, e não em arquivos próprios, porque
 * nenhuma delas existe fora deste payload: são as três etapas da mesma tela.
 */

function toUpperCase(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

@ValidatorConstraint({ name: 'circuitNameLength', async: false })
class CircuitNameLengthConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const circuit = args.object as CircuitSignupCircuitDto;
    const maxLength = circuit.code === undefined ? 20 : 150;

    return value.length >= 2 && value.length <= maxLength;
  }

  defaultMessage(args: ValidationArguments): string {
    const circuit = args.object as CircuitSignupCircuitDto;

    return circuit.code === undefined
      ? 'O circuito deve ter entre 2 e 20 caracteres'
      : 'O nome legado do circuito deve ter entre 2 e 150 caracteres';
  }
}

/** Etapa 1 da tela: quem está cadastrando o circuito. */
export class CircuitSignupCoordinatorDto {
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @IsNotEmpty()
  @Length(PERSON_NAME_LENGTH.MIN, PERSON_NAME_LENGTH.MAX)
  name!: string;

  @Transform(({ value }) => toNormalizedEmail(value))
  @IsEmail()
  @Length(1, 255)
  email!: string;

  /**
   * Apenas dígitos, com DDD. A máscara `(00) 00000-0000` do desenho é
   * apresentação: o que chega aqui é normalizado antes de ser validado, para que
   * o mesmo celular digitado com ou sem máscara caia no mesmo valor.
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

/** Etapa 2 da tela: o circuito que está nascendo. */
export class CircuitSignupCircuitDto {
  /**
   * Alias temporário para clientes anteriores à correção do contrato. Não faz
   * parte da API pública e será removido no contract SUC-60.
   */
  @ApiHideProperty()
  @Transform(({ value }) => toUpperCase(value))
  @IsOptional()
  @IsString()
  @Length(2, 20)
  @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, {
    message: 'O código do circuito aceita letras, números e hífen entre eles (ex.: SP-17)',
  })
  code?: string;

  /** Identificador real do circuito (`SP-17`, `SP-019 A`). */
  @ApiProperty({ example: 'SP-17', minLength: 2, maxLength: 20 })
  @Transform(({ value }) => toUpperCase(value))
  @IsString()
  @IsNotEmpty()
  @Validate(CircuitNameLengthConstraint)
  name!: string;

  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  city!: string;

  @Transform(({ value }) => toUpperCase(value))
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'A UF deve ter exatamente 2 letras' })
  state!: string;
}

/**
 * Uma linha da etapa 3. O e-mail não é pedido aqui de propósito: o coordenador
 * do circuito não tem como saber o endereço de cada congregação no momento do
 * cadastro — ver SUC-31.
 */
export class CircuitSignupCongregationDto {
  @Transform(({ value }) => toUpperCase(value))
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, {
    message: 'O código da congregação aceita letras, números e hífen entre eles',
  })
  code!: string;

  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  name!: string;
}

export class CreateCircuitSignupDto {
  @ValidateNested()
  @Type(() => CircuitSignupCoordinatorDto)
  coordinator!: CircuitSignupCoordinatorDto;

  @ValidateNested()
  @Type(() => CircuitSignupCircuitDto)
  circuit!: CircuitSignupCircuitDto;

  /**
   * A **primeira** é a congregação do próprio coordenador, e é por isso que o
   * mínimo é 1: é ela que recebe o `congregationId` do usuário criado. A ordem
   * importa, e o desenho da etapa 3 deixa isso explícito na tela.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CIRCUIT_SIGNUP.MAX_CONGREGATIONS)
  @ValidateNested({ each: true })
  @Type(() => CircuitSignupCongregationDto)
  congregations!: CircuitSignupCongregationDto[];

  /**
   * Versão dos termos que o coordenador aceitou na etapa 2. Opcional até o front
   * passar a enviá-la (SUC-86); presente, o aceite é gravado no usuário criado na
   * confirmação, com o momento do envio, não o da confirmação por código.
   */
  @IsOptional()
  @IsString()
  @Matches(TERMS_VERSION_REGEX, { message: TERMS_VERSION_MESSAGE })
  @IsISO8601({ strict: true }, { message: TERMS_VERSION_MESSAGE })
  termsVersion?: string;
}
