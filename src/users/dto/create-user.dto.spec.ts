import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';

const CONGREGATION_ID = '8f2f0a52-6b1f-4a43-9d0e-3f5f3a8f6c11';

function buildRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'João Silva',
    email: 'joao@example.com',
    password: 'Senha-Segura123',
    role: 'CONGREGATION_COORDINATOR',
    congregationId: CONGREGATION_ID,
    ...overrides,
  };
}

describe('CreateUserDto', () => {
  it('deve levar o e-mail a minúsculas, para o banco nunca receber duas caixas da mesma conta', async () => {
    const dto = plainToInstance(CreateUserDto, buildRaw({ email: ' Joao.Silva@Example.COM ' }));

    expect(dto.email).toBe('joao.silva@example.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('deve recusar e-mail malformado', async () => {
    const errors = await validate(plainToInstance(CreateUserDto, buildRaw({ email: 'não-é-email' })));

    expect(errors.map((error) => error.property)).toContain('email');
  });
});

describe('UpdateUserDto', () => {
  it('deve normalizar o e-mail também na atualização, que herda a regra do cadastro', () => {
    const dto = plainToInstance(UpdateUserDto, { email: 'Joao@EXAMPLE.com' });

    expect(dto.email).toBe('joao@example.com');
  });

  it('deve deixar o e-mail ausente como está, para a atualização parcial não gravar vazio', () => {
    const dto = plainToInstance(UpdateUserDto, { name: 'Novo Nome' });

    expect(dto.email).toBeUndefined();
  });
});
