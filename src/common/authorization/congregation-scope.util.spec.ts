import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { resolveCongregationScope } from './congregation-scope.util';

const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const OTHER_CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000099';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const OTHER_CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000002';

function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'u1u2u3u4-0000-0000-0000-000000000001',
    email: 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : CONGREGATION_ID,
  };
}

describe('resolveCongregationScope', () => {
  let prismaMock: DeepMockProxy<PrismaClient>;
  let prisma: PrismaService;

  beforeEach(() => {
    prismaMock = mockDeep<PrismaClient>();
    prisma = { client: prismaMock } as unknown as PrismaService;
  });

  describe('role de circuito', () => {
    it('deve retornar undefined (todas) quando não há congregationId', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });

      const scope = await resolveCongregationScope(prisma, user, CIRCUIT_ID);

      expect(scope).toBeUndefined();
      expect(prismaMock.congregation.findUnique).not.toHaveBeenCalled();
    });

    it('deve retornar a congregação quando ela pertence ao circuito do evento', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.congregation.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);

      const scope = await resolveCongregationScope(prisma, user, CIRCUIT_ID, CONGREGATION_ID);

      expect(scope).toBe(CONGREGATION_ID);
    });

    it('deve lançar NotFoundException quando a congregação não existe', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.congregation.findUnique.mockResolvedValue(null);

      await expect(resolveCongregationScope(prisma, user, CIRCUIT_ID, CONGREGATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException quando a congregação é de outro circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.congregation.findUnique.mockResolvedValue({ circuitId: OTHER_CIRCUIT_ID } as never);

      await expect(resolveCongregationScope(prisma, user, CIRCUIT_ID, CONGREGATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('role de congregação', () => {
    it('deve retornar a própria congregação ignorando filtro ausente', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

      const scope = await resolveCongregationScope(prisma, user, CIRCUIT_ID);

      expect(scope).toBe(CONGREGATION_ID);
      expect(prismaMock.congregation.findUnique).not.toHaveBeenCalled();
    });

    it('deve retornar a própria congregação quando o filtro coincide', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

      const scope = await resolveCongregationScope(prisma, user, CIRCUIT_ID, CONGREGATION_ID);

      expect(scope).toBe(CONGREGATION_ID);
    });

    it('deve lançar ForbiddenException quando pede outra congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });

      await expect(resolveCongregationScope(prisma, user, CIRCUIT_ID, OTHER_CONGREGATION_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar ForbiddenException quando o usuário não tem congregação vinculada', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: null });

      await expect(resolveCongregationScope(prisma, user, CIRCUIT_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
