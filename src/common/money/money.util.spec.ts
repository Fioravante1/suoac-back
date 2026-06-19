import { formatMoney } from './money.util';

describe('formatMoney', () => {
  it('deve formatar inteiro com 2 casas decimais', () => {
    expect(formatMoney(25)).toBe('25.00');
  });

  it('deve preservar as casas decimais existentes', () => {
    expect(formatMoney(25.5)).toBe('25.50');
    expect(formatMoney(1234.56)).toBe('1234.56');
  });

  it('deve retornar "0.00" para null', () => {
    expect(formatMoney(null)).toBe('0.00');
  });

  it('deve retornar "0.00" para undefined', () => {
    expect(formatMoney(undefined)).toBe('0.00');
  });

  it('deve retornar "0.00" para zero', () => {
    expect(formatMoney(0)).toBe('0.00');
  });

  it('deve delegar ao toFixed do valor (compatível com Decimal do Prisma)', () => {
    const decimalLike = { toFixed: (digits: number): string => `99.${'9'.repeat(digits)}` };

    expect(formatMoney(decimalLike)).toBe('99.99');
  });
});
