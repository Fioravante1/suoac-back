import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validConfig = (): Record<string, unknown> => ({
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    PASSWORD_PEPPER: 'c'.repeat(32),
    ENCRYPTION_KEY: 'a'.repeat(64),
  });

  it('deve retornar a config quando todos os secrets são válidos', () => {
    const config = validConfig();
    expect(validateEnv(config)).toBe(config);
  });

  it('deve lançar erro quando JWT_SECRET está ausente', () => {
    const config = validConfig();
    delete config['JWT_SECRET'];
    expect(() => validateEnv(config)).toThrow('JWT_SECRET é obrigatória');
  });

  it('deve lançar erro quando JWT_SECRET é mais curto que o mínimo', () => {
    const config = { ...validConfig(), JWT_SECRET: 'a'.repeat(31) };
    expect(() => validateEnv(config)).toThrow('JWT_SECRET deve ter no mínimo 32 caracteres');
  });

  it('deve lançar erro quando PASSWORD_PEPPER é fraco', () => {
    const config = { ...validConfig(), PASSWORD_PEPPER: 'curto' };
    expect(() => validateEnv(config)).toThrow('PASSWORD_PEPPER');
  });

  it('deve lançar erro quando ENCRYPTION_KEY não é hex de 64 caracteres', () => {
    const config = { ...validConfig(), ENCRYPTION_KEY: 'z'.repeat(64) };
    expect(() => validateEnv(config)).toThrow('ENCRYPTION_KEY');
  });

  it('deve lançar erro quando ENCRYPTION_KEY tem comprimento incorreto', () => {
    const config = { ...validConfig(), ENCRYPTION_KEY: 'ab'.repeat(10) };
    expect(() => validateEnv(config)).toThrow('ENCRYPTION_KEY');
  });

  it('deve acumular múltiplos erros na mensagem', () => {
    expect(() => validateEnv({})).toThrow(
      /JWT_SECRET[\s\S]*JWT_REFRESH_SECRET[\s\S]*PASSWORD_PEPPER[\s\S]*ENCRYPTION_KEY/,
    );
  });
});
