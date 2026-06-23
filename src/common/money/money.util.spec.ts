import { addMoney, formatMoney, formatMoneyPtBR, subtractMoney } from './money.util';

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

describe('addMoney', () => {
  it('deve somar múltiplos valores com precisão exata', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('1500.00', '250.50', '0.50')).toBe('1751.00');
  });

  it('deve tratar null/undefined como zero', () => {
    expect(addMoney('100.00', null, undefined)).toBe('100.00');
    expect(addMoney()).toBe('0.00');
  });

  it('deve aceitar Decimal-like (toFixed) — compatível com _sum do Prisma', () => {
    const decimalLike = { toFixed: (d: number): string => (1840).toFixed(d) };
    expect(addMoney(decimalLike, '160.00')).toBe('2000.00');
  });

  it('deve somar valores negativos corretamente', () => {
    expect(addMoney('100.00', '-30.00')).toBe('70.00');
  });

  it('deve rejeitar string com mais de 2 casas decimais (em vez de truncar)', () => {
    expect(() => addMoney('1.999')).toThrow('Valor monetário inválido');
  });

  it('deve rejeitar string não numérica', () => {
    expect(() => addMoney('abc')).toThrow('Valor monetário inválido');
  });
});

describe('subtractMoney', () => {
  it('deve subtrair com precisão exata', () => {
    expect(subtractMoney('1500.00', '250.50')).toBe('1249.50');
    expect(subtractMoney('0.30', '0.10')).toBe('0.20');
  });

  it('deve retornar resultado negativo quando b > a (saldo deficitário)', () => {
    expect(subtractMoney('100.00', '150.00')).toBe('-50.00');
  });

  it('deve tratar null/undefined como zero', () => {
    expect(subtractMoney('100.00', null)).toBe('100.00');
    expect(subtractMoney(null, '40.00')).toBe('-40.00');
  });
});
