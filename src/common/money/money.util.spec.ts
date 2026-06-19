import { formatMoney, formatMoneyPtBR } from './money.util';

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

describe('formatMoneyPtBR', () => {
  it('deve agrupar milhares com ponto e usar vírgula decimal', () => {
    expect(formatMoneyPtBR('1500.00')).toBe('1.500,00');
    expect(formatMoneyPtBR('1234567.89')).toBe('1.234.567,89');
  });

  it('deve manter valores pequenos sem separador de milhar', () => {
    expect(formatMoneyPtBR('50.00')).toBe('50,00');
    expect(formatMoneyPtBR('0.00')).toBe('0,00');
  });

  it('deve completar casas decimais ausentes', () => {
    expect(formatMoneyPtBR('100')).toBe('100,00');
    expect(formatMoneyPtBR('100.5')).toBe('100,50');
  });

  it('deve preservar sinal negativo', () => {
    expect(formatMoneyPtBR('-1500.00')).toBe('-1.500,00');
  });
});
