import { PaymentStatus } from '../../generated/prisma/enums';
import { addMoney } from './money.util';
import { paymentStatusFromAmounts } from './payment-status.util';

describe('paymentStatusFromAmounts', () => {
  it('deve retornar PENDING quando nada foi pago', () => {
    expect(paymentStatusFromAmounts('0.00', '100.00')).toBe(PaymentStatus.PENDING);
    expect(paymentStatusFromAmounts(0, 100)).toBe(PaymentStatus.PENDING);
  });

  it('deve retornar PENDING quando pago é null/undefined', () => {
    expect(paymentStatusFromAmounts(null, '100.00')).toBe(PaymentStatus.PENDING);
    expect(paymentStatusFromAmounts(undefined, '100.00')).toBe(PaymentStatus.PENDING);
  });

  it('deve retornar PENDING quando pago é negativo', () => {
    expect(paymentStatusFromAmounts('-10.00', '100.00')).toBe(PaymentStatus.PENDING);
  });

  it('deve retornar PARTIAL quando pago é menor que o total', () => {
    expect(paymentStatusFromAmounts('40.00', '100.00')).toBe(PaymentStatus.PARTIAL);
  });

  it('deve retornar PAID quando pago é igual ao total (igualdade exata)', () => {
    expect(paymentStatusFromAmounts('100.00', '100.00')).toBe(PaymentStatus.PAID);
  });

  it('deve retornar PAID quando pago excede o total', () => {
    expect(paymentStatusFromAmounts('120.00', '100.00')).toBe(PaymentStatus.PAID);
  });

  it('deve aceitar Decimal-like (toFixed) do Prisma', () => {
    const paid = { toFixed: (d: number): string => (50).toFixed(d) };
    const total = { toFixed: (d: number): string => (100).toFixed(d) };
    expect(paymentStatusFromAmounts(paid, total)).toBe(PaymentStatus.PARTIAL);
  });

  it('deve tratar corretamente somas que em ponto flutuante dariam erro de precisão', () => {
    // 0.10 + 0.20 = 0.30 exato em centavos (em Number daria 0.30000000000000004)
    const paid = addMoney('0.10', '0.20');
    expect(paymentStatusFromAmounts(paid, '0.30')).toBe(PaymentStatus.PAID);
  });
});
