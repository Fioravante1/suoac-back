import { PaymentStatus } from '../../generated/prisma/enums';
import { compareMoney, type MoneyLike } from './money.util';

/**
 * Deriva o {@link PaymentStatus} a partir dos valores pago e total, comparando em
 * centavos inteiros (sem ponto flutuante). Centraliza a regra antes duplicada em
 * `PaymentsService` e `EventPassengersService`:
 *
 * - pago `<= 0`  → `PENDING`
 * - pago `< total` → `PARTIAL`
 * - caso contrário → `PAID`
 *
 * Fica fora de `money.util.ts` para não acoplar o util de dinheiro ao enum do Prisma.
 * Não trata isenção (`EXEMPT`) — quem chama decide isso antes (regra de negócio).
 */
export function paymentStatusFromAmounts(
  paid: MoneyLike | string | null | undefined,
  total: MoneyLike | string | null | undefined,
): PaymentStatus {
  if (compareMoney(paid, 0) <= 0) {
    return PaymentStatus.PENDING;
  }

  if (compareMoney(paid, total) < 0) {
    return PaymentStatus.PARTIAL;
  }

  return PaymentStatus.PAID;
}
