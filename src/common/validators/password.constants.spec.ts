import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from '../../auth/dto/change-password.dto';
import { CircuitSignupCoordinatorDto } from '../../auth/dto/create-circuit-signup.dto';
import { LoginDto } from '../../auth/dto/login.dto';
import { ResetPasswordDto } from '../../auth/dto/reset-password.dto';
import { AcceptInvitationDto } from '../../invitations/dto/accept-invitation.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './password.constants';

describe('PASSWORD_COMPLEXITY_REGEX', () => {
  it.each(['Senha-Segura1', 'Aa1!aaaaaaaa', 'Senha_segura9', 'Ação-Segura1', 'Senha€Segura1'])(
    'deve aceitar %s, que tem minúscula, maiúscula, número e símbolo',
    (password) => {
      expect(PASSWORD_COMPLEXITY_REGEX.test(password)).toBe(true);
    },
  );

  it.each([
    ['sem símbolo', 'SenhaSegura123'],
    ['sem número', 'Senha-Segura-x'],
    ['sem maiúscula', 'senha-segura1'],
    ['sem minúscula', 'SENHA-SEGURA1'],
    ['com espaço no lugar do símbolo', 'Senha Segura 1'],
    ['só com letra acentuada no lugar do símbolo', 'SenhaSeguraÇ1'],
  ])('deve recusar a senha %s', (_caso, password) => {
    expect(PASSWORD_COMPLEXITY_REGEX.test(password)).toBe(false);
  });
});

/** Cada DTO que define senha, com o campo onde ela chega. */
const PASSWORD_DTOS = [
  { name: 'CreateUserDto', type: CreateUserDto, field: 'password' },
  { name: 'AcceptInvitationDto', type: AcceptInvitationDto, field: 'password' },
  { name: 'CircuitSignupCoordinatorDto', type: CircuitSignupCoordinatorDto, field: 'password' },
  { name: 'ResetPasswordDto', type: ResetPasswordDto, field: 'newPassword' },
  { name: 'ChangePasswordDto', type: ChangePasswordDto, field: 'newPassword' },
] as const;

async function passwordMessages(type: ClassConstructor<object>, field: string, password: string): Promise<string[]> {
  const errors = await validate(plainToInstance(type, { [field]: password }));
  const passwordError = errors.find((error) => error.property === field);

  return Object.values(passwordError?.constraints ?? {});
}

describe.each(PASSWORD_DTOS)('política de senha em $name', ({ type, field }) => {
  const symbolAndComplexity = 'Aa1!';

  it(`deve recusar ${PASSWORD_MIN_LENGTH - 1} caracteres, mesmo com todas as classes`, async () => {
    const password = symbolAndComplexity + 'a'.repeat(PASSWORD_MIN_LENGTH - 1 - symbolAndComplexity.length);

    expect(password).toHaveLength(PASSWORD_MIN_LENGTH - 1);
    expect(await passwordMessages(type, field, password)).toContain(PASSWORD_LENGTH_MESSAGE);
  });

  it(`deve aceitar ${PASSWORD_MIN_LENGTH} caracteres com símbolo`, async () => {
    const password = symbolAndComplexity + 'a'.repeat(PASSWORD_MIN_LENGTH - symbolAndComplexity.length);

    expect(password).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(await passwordMessages(type, field, password)).toEqual([]);
  });

  it(`deve recusar ${PASSWORD_MIN_LENGTH} caracteres sem símbolo`, async () => {
    const password = 'Aa1' + 'a'.repeat(PASSWORD_MIN_LENGTH - 3);

    expect(await passwordMessages(type, field, password)).toEqual([PASSWORD_COMPLEXITY_MESSAGE]);
  });

  it(`deve aceitar o teto de ${PASSWORD_MAX_LENGTH} caracteres`, async () => {
    const password = symbolAndComplexity + 'a'.repeat(PASSWORD_MAX_LENGTH - symbolAndComplexity.length);

    expect(await passwordMessages(type, field, password)).toEqual([]);
  });

  it(`deve recusar mais de ${PASSWORD_MAX_LENGTH} caracteres`, async () => {
    const password = symbolAndComplexity + 'a'.repeat(PASSWORD_MAX_LENGTH + 1 - symbolAndComplexity.length);

    expect(await passwordMessages(type, field, password)).toContain(PASSWORD_LENGTH_MESSAGE);
  });
});

describe('login com senha anterior à política de 12 caracteres', () => {
  it('deve continuar aceitando senha de 8 caracteres, para quem cadastrou antes', async () => {
    const errors = await validate(plainToInstance(LoginDto, { email: 'fulano@exemplo.com', password: 'Senha123' }));

    expect(errors).toEqual([]);
  });
});
