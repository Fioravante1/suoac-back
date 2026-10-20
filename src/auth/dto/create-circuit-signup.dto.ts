import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PASSWORD_COMPLEXITY_MESSAGE, PASSWORD_COMPLEXITY_REGEX } from '../../common/validators/password.constants';
import { CIRCUIT_SIGNUP } from '../circuit-signup.constants';

/**
 * As classes aninhadas vivem neste arquivo, e não em arquivos próprios, porque
 * nenhuma delas existe fora deste payload: são as três etapas da mesma tela.
 */

function toTrimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function toUpperCase(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function toLowerCase(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/** Etapa 1 da tela: quem está cadastrando o circuito. */
export class CircuitSignupCoordinatorDto {
  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  name!: string;

  @Transform(({ value }) => toLowerCase(value))
  @IsEmail()
  @Length(1, 255)
  email!: string;

  /**
   * Apenas dígitos, com DDD. A máscara `(00) 00000-0000` do desenho é
   * apresentação: o que chega aqui é normalizado antes de ser validado, para que
   * o mesmo celular digitado com ou sem máscara caia no mesmo valor.
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

/** Etapa 2 da tela: o circuito que está nascendo. */
export class CircuitSignupCircuitDto {
  /**
   * Código curto do circuito (`SP-17`). Normalizado em maiúsculas antes da
   * validação, para `sp-17` e `SP-17` serem o mesmo circuito.
   */
  @Transform(({ value }) => toUpperCase(value))
  @IsString()
  @Length(2, 20)
  @Matches(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, {
    message: 'O código do circuito aceita letras, números e hífen entre eles (ex.: SP-17)',
  })
  code!: string;

  @Transform(({ value }) => toTrimmed(value))
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
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
}
