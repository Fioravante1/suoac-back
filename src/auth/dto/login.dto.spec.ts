import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it.each(['Fulano@Exemplo.com', 'FULANO@EXEMPLO.COM', '  fulano@exemplo.com '])(
    'deve levar %j a minúsculas, para o login funcionar com qualquer combinação de caixa',
    async (email) => {
      const dto = plainToInstance(LoginDto, { email, password: 'Senha123' });

      expect(dto.email).toBe('fulano@exemplo.com');
      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it('deve recusar e-mail malformado', async () => {
    const errors = await validate(plainToInstance(LoginDto, { email: 'não-é-email', password: 'Senha123' }));

    expect(errors.map((error) => error.property)).toContain('email');
  });

  it('deve recusar e-mail que não é texto', async () => {
    const errors = await validate(plainToInstance(LoginDto, { email: 42, password: 'Senha123' }));

    expect(errors.map((error) => error.property)).toContain('email');
  });
});
