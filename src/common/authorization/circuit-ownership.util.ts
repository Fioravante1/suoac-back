import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

export function isCircuitRole(role: string): boolean {
  return role === 'CIRCUIT_COORDINATOR' || role === 'CIRCUIT_ASSISTANT';
}

export function checkCircuitOwnership(user: JwtPayload, resourceCircuitId: string): void {
  if (user.circuitId !== resourceCircuitId) {
    throw new ForbiddenException('Sem permissão para acessar recursos de outro circuito');
  }
}

export function checkCongregationPermission(
  user: JwtPayload,
  resourceCongregationId: string,
  context = 'recursos',
): void {
  if (!isCircuitRole(user.role) && user.congregationId !== resourceCongregationId) {
    throw new ForbiddenException(`Sem permissão para operar ${context} de outra congregação`);
  }
}
