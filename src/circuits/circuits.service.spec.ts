import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitsService } from './circuits.service';
import type { CircuitResponse } from './interfaces/circuit-response.interface';

// ── Helpers ──────────────────────────────────────────────────────
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'u1u2u3u4-0000-0000-0000-000000000001',
    email: 'user@example.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId ?? null,
  };
}

function buildCircuit(overrides: Partial<CircuitResponse> = {}): CircuitResponse {
  return {
    id: overrides.id ?? CIRCUIT_ID,
    name: overrides.name ?? 'SP-01',
    city: overrides.city ?? 'São Paulo',
    state: overrides.state ?? 'SP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CircuitsService', () => {
  let service: CircuitsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let auditLogService: { log: jest.Mock };

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [
        CircuitsService,
        {
          provide: PrismaService,
          useValue: { client: prismaMock },
        },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(CircuitsService);
    auditLogService = module.get(AuditLogService);
  });

  // ── findOwn ──────────────────────────────────────────────────
  describe('findOwn', () => {
    it('deve retornar o circuito do usuário', async () => {
      const expected = buildCircuit();
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());

      const result = await service.findOwn(buildUser());

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.findUnique).toHaveBeenCalledWith({
        where: { id: CIRCUIT_ID },
        select: expect.any(Object),
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findOwn(buildUser())).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o circuito quando ele existe e pertence ao circuito do usuário', async () => {
      const expected = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());

      const result = await service.findOne(expected.id, buildUser());

      expect(result).toEqual(expected);
      expect(prismaMock.circuit.findUnique).toHaveBeenCalledWith({
        where: { id: expected.id },
        select: expect.any(Object),
      });
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuitId do usuário não coincide', async () => {
      const circuit = buildCircuit();
      prismaMock.circuit.findUnique.mockResolvedValue(circuit);

      await expect(service.findOne(circuit.id, buildUser({ circuitId: 'outro-circuito' }))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar apenas os campos enviados', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ name: 'SP-02' });
      const user = buildUser();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(updated);

      const result = await service.update(existing.id, { name: 'sp-02' }, user);

      expect(result.name).toBe('SP-02');
      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { name: 'SP-02' },
        select: expect.any(Object),
      });
      expect(auditLogService.log).toHaveBeenCalledWith(
        'UPDATE',
        'Circuit',
        existing.id,
        user.sub,
        expect.objectContaining({ oldValues: expect.any(Object), newValues: expect.any(Object) }),
      );
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { name: 'Novo' }, buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const existing = buildCircuit();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(existing);

      const result = await service.update(existing.id, {}, buildUser());

      expect(result).toEqual(buildCircuit());
      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: {},
        select: expect.any(Object),
      });
    });

    it('deve converter state para uppercase na atualização', async () => {
      const existing = buildCircuit();
      const updated = buildCircuit({ state: 'RJ' });

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.update.mockResolvedValue(updated);

      await service.update(existing.id, { state: 'rj' }, buildUser());

      expect(prismaMock.circuit.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: { state: 'RJ' },
        select: expect.any(Object),
      });
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve deletar o circuito quando ele existe', async () => {
      const existing = buildCircuit();
      const user = buildUser();

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      prismaMock.circuit.delete.mockResolvedValue(existing);

      await service.remove(existing.id, user);

      expect(auditLogService.log).toHaveBeenCalledWith(
        'DELETE',
        'Circuit',
        existing.id,
        user.sub,
        expect.objectContaining({ oldValues: expect.any(Object), newValues: null }),
      );
      expect(prismaMock.circuit.delete).toHaveBeenCalledWith({
        where: { id: existing.id },
      });
    });

    it('deve gravar audit log ANTES do delete', async () => {
      const existing = buildCircuit();
      const callOrder: string[] = [];

      prismaMock.circuit.findUnique.mockResolvedValue(existing);
      auditLogService.log.mockImplementation(() => {
        callOrder.push('audit');
        return Promise.resolve();
      });
      prismaMock.circuit.delete.mockImplementation((() => {
        callOrder.push('delete');
        return Promise.resolve(existing);
      }) as never);

      await service.remove(existing.id, buildUser());

      expect(callOrder).toEqual(['audit', 'delete']);
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente', buildUser())).rejects.toThrow(NotFoundException);
    });
  });
  describe('getSummary', () => {
    it('conta ativos e somente convites não usados, revogados, recusados ou expirados', async () => {
      const now = new Date('2026-11-27T12:00:00Z');
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.congregation.count.mockResolvedValue(20);
      prismaMock.user.count.mockResolvedValue(18);
      prismaMock.invitation.count.mockResolvedValue(2);
      expect(await service.getSummary(CIRCUIT_ID, buildUser(), now)).toEqual({
        activeCongregationCount: 20,
        activeCoordinatorCount: 18,
        pendingInvitationCount: 2,
      });
      expect(prismaMock.congregation.count).toHaveBeenCalledWith({ where: { circuitId: CIRCUIT_ID, isActive: true } });
      expect(prismaMock.user.count).toHaveBeenCalledWith({
        where: { circuitId: CIRCUIT_ID, role: 'CONGREGATION_COORDINATOR', isActive: true },
      });
      expect(prismaMock.invitation.count).toHaveBeenCalledWith({
        where: { circuitId: CIRCUIT_ID, usedAt: null, revokedAt: null, declinedAt: null, expiresAt: { gt: now } },
      });
    });
    it.each(['CONGREGATION_COORDINATOR', 'CONGREGATION_ASSISTANT'] as const)('nega o resumo para %s', async (role) => {
      await expect(service.getSummary(CIRCUIT_ID, buildUser({ role }))).rejects.toThrow(ForbiddenException);
      expect(prismaMock.congregation.count).not.toHaveBeenCalled();
    });
    it('nega outro circuito antes de consultar contagens', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      await expect(service.getSummary(CIRCUIT_ID, buildUser({ circuitId: 'other' }))).rejects.toThrow(
        ForbiddenException,
      );
      expect(prismaMock.congregation.count).not.toHaveBeenCalled();
    });
    it('retorna 404 para circuito inexistente', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);
      await expect(service.getSummary(CIRCUIT_ID, buildUser())).rejects.toThrow(NotFoundException);
    });
  });
});
