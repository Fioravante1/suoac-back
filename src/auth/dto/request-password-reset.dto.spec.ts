import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestPasswordResetDto } from './request-password-reset.dto';

describe('RequestPasswordResetDto', () => {
  it('deve levar o e-mail a minúsculas e aparar as pontas', async () => {
    const dto = plainToInstance(RequestPasswordResetDto, { email: '  Fulano@Exemplo.COM ' });

    expect(dto.email).toBe('fulano@exemplo.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it('deve recusar e-mail malformado', async () => {
    const errors = await validate(plainToInstance(RequestPasswordResetDto, { email: 'não-é-email' }));

    expect(errors.map((error) => error.property)).toContain('email');
  });
});
