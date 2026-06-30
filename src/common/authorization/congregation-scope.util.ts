import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { PrismaService } from '../../prisma/prisma.service';
import { isCircuitRole } from './circuit-ownership.util';

/**
 * Resolve o escopo de congregação para LEITURA por evento/circuito.
 *
 * - Role de circuito: sem filtro → `undefined` (todas); com filtro → valida que a
 *   congregação pertence ao circuito do evento, lançando `NotFoundException` caso
 *   contrário (não revela existência em outro circuito).
 * - Role de congregação: restrita à própria congregação; pedir outra → `ForbiddenException`;
 *   `congregationId` nulo → `ForbiddenException`.
 *
 * Recebe o `PrismaService` (barreira arquitetural do projeto) e usa `prisma.client.*` —
 * nunca um `PrismaClient` solto (AGENTS §3).
 */
export async function resolveCongregationScope(
  prisma: PrismaService,
  user: JwtPayload,
  eventCircuitId: string,
  requestedCongregationId?: string,
): Promise<string | undefined> {
  if (!isCircuitRole(user.role)) {
    if (!user.congregationId) {
      throw new ForbiddenException('Usuário de congregação sem congregação vinculada');
    }

    if (requestedCongregationId && requestedCongregationId !== user.congregationId) {
      throw new ForbiddenException('Sem permissão para acessar recursos de outra congregação');
    }

    return user.congregationId;
  }

  if (!requestedCongregationId) {
    return undefined;
  }

  const congregation = await prisma.client.congregation.findUnique({
    where: { id: requestedCongregationId },
    select: { circuitId: true },
  });

  if (!congregation || congregation.circuitId !== eventCircuitId) {
    throw new NotFoundException('Congregação não encontrada neste circuito');
  }

  return requestedCongregationId;
}
