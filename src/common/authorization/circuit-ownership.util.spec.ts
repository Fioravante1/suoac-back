import { ForbiddenException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, checkCongregationPermission, isCircuitRole } from './circuit-ownership.util';

const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';

function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'u1u2u3u4-0000-0000-0000-000000000001',
    email: 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
  };
}

describe('isCircuitRole', () => {
  it('deve retornar true para CIRCUIT_COORDINATOR', () => {
    expect(isCircuitRole('CIRCUIT_COORDINATOR')).toBe(true);
  });

  it('deve retornar true para CIRCUIT_ASSISTANT', () => {
    expect(isCircuitRole('CIRCUIT_ASSISTANT')).toBe(true);
  });

  it('deve retornar false para CONGREGATION_COORDINATOR', () => {
    expect(isCircuitRole('CONGREGATION_COORDINATOR')).toBe(false);
  });

  it('deve retornar false para CONGREGATION_ASSISTANT', () => {
    expect(isCircuitRole('CONGREGATION_ASSISTANT')).toBe(false);
  });
});

describe('checkCircuitOwnership', () => {
  it('não deve lançar exceção quando circuitId coincide', () => {
    const user = buildUser();

    expect(() => checkCircuitOwnership(user, CIRCUIT_ID)).not.toThrow();
  });

  it('deve lançar ForbiddenException quando circuitId não coincide', () => {
    const user = buildUser();

    expect(() => checkCircuitOwnership(user, 'outro-circuito')).toThrow(ForbiddenException);
  });
});

describe('checkCongregationPermission', () => {
  it('não deve lançar exceção para roles de circuito independente da congregação', () => {
    const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: CONGREGATION_ID });

    expect(() => checkCongregationPermission(user, 'outra-congregacao')).not.toThrow();
  });

  it('não deve lançar exceção para role de congregação quando congregationId coincide', () => {
    const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

    expect(() => checkCongregationPermission(user, CONGREGATION_ID)).not.toThrow();
  });

  it('deve lançar ForbiddenException para role de congregação quando congregationId não coincide', () => {
    const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

    expect(() => checkCongregationPermission(user, 'outra-congregacao')).toThrow(ForbiddenException);
  });

  it('deve incluir o contexto na mensagem de erro', () => {
    const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

    expect(() => checkCongregationPermission(user, 'outra-congregacao', 'passageiros')).toThrow(
      'Sem permissão para operar passageiros de outra congregação',
    );
  });

  it('deve usar contexto padrão "recursos" quando não informado', () => {
    const user = buildUser({ role: 'CONGREGATION_ASSISTANT', congregationId: CONGREGATION_ID });

    expect(() => checkCongregationPermission(user, 'outra-congregacao')).toThrow(
      'Sem permissão para operar recursos de outra congregação',
    );
  });
});
