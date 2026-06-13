import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CongregationEventStatusService } from './congregation-event-status.service';

import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// ── Types ────────────────────────────────────────────────────────
interface PrismaEvent {
  id: string;
  status: string;
  circuitId: string;
}

interface PrismaCongregation {
  id: string;
  code: string;
  name: string;
  email: string;
  city: string | null;
  isActive: boolean;
  circuitId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PrismaCongregationEventStatus {
  id: string;
  status: string;
  congregationId: string;
  eventId: string;
  finalizedById: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
}

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const CONGREGATION_ID_2 = 'c1c2c3c4-0000-0000-0000-000000000002';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'circuit-1';
const STATUS_ID = 's1s2s3s4-0000-0000-0000-000000000001';

// ── Helpers ──────────────────────────────────────────────────────
function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'user@test.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : CONGREGATION_ID,
  };
}

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? EVENT_ID,
    status: overrides.status ?? 'OPEN',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
  };
}

function buildCongregation(overrides: Partial<PrismaCongregation> = {}): PrismaCongregation {
  return {
    id: overrides.id ?? CONGREGATION_ID,
    code: overrides.code ?? 'SP-01',
    name: overrides.name ?? 'Congregação Central',
    email: overrides.email ?? 'central@test.com',
    city: overrides.city ?? 'São Paulo',
    isActive: overrides.isActive ?? true,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildStatus(overrides: Partial<PrismaCongregationEventStatus> = {}): PrismaCongregationEventStatus {
  return {
    id: overrides.id ?? STATUS_ID,
    status: overrides.status ?? 'PENDING',
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    eventId: overrides.eventId ?? EVENT_ID,
    finalizedById: overrides.finalizedById ?? null,
    finalizedAt: overrides.finalizedAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('CongregationEventStatusService', () => {
  let service: CongregationEventStatusService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [
        CongregationEventStatusService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(CongregationEventStatusService);
  });

  // ── findByEvent ────────────────────────────────────────────────
  describe('findByEvent', () => {
    it('deve retornar todas as congregações com status sintetizado PENDING quando não há registro', async () => {
      const user = buildUser();
      const congregation = buildCongregation();

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findMany.mockResolvedValue([congregation] as never);
      prismaMock.congregationEventStatus.findMany.mockResolvedValue([]);

      const result = await service.findByEvent(EVENT_ID, user);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBeNull();
      expect(result[0]!.status).toBe('PENDING');
      expect(result[0]!.congregationName).toBe('Congregação Central');
    });

    it('deve retornar status FINALIZED para congregações com registro', async () => {
      const user = buildUser();
      const congregation = buildCongregation();
      const status = buildStatus({ status: 'FINALIZED', finalizedById: USER_ID, finalizedAt: new Date() });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findMany.mockResolvedValue([congregation] as never);
      prismaMock.congregationEventStatus.findMany.mockResolvedValue([status] as never);

      const result = await service.findByEvent(EVENT_ID, user);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(STATUS_ID);
      expect(result[0]!.status).toBe('FINALIZED');
      expect(result[0]!.finalizedById).toBe(USER_ID);
    });

    it('deve retornar múltiplas congregações com mix de status', async () => {
      const user = buildUser();
      const cong1 = buildCongregation({ id: CONGREGATION_ID, name: 'Cong A' });
      const cong2 = buildCongregation({ id: CONGREGATION_ID_2, name: 'Cong B' });
      const status = buildStatus({ congregationId: CONGREGATION_ID, status: 'FINALIZED' });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findMany.mockResolvedValue([cong1, cong2] as never);
      prismaMock.congregationEventStatus.findMany.mockResolvedValue([status] as never);

      const result = await service.findByEvent(EVENT_ID, user);

      expect(result).toHaveLength(2);
      expect(result[0]!.status).toBe('FINALIZED');
      expect(result[1]!.status).toBe('PENDING');
      expect(result[1]!.id).toBeNull();
    });

    it('deve lançar NotFoundException quando evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.findByEvent(EVENT_ID, buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuito do usuário não coincide', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);

      await expect(service.findByEvent(EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── updateStatus ────────────────────────────────────────────────
  describe('updateStatus', () => {
    it('deve finalizar lista com upsert', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      const upserted = buildStatus({ status: 'FINALIZED', finalizedById: USER_ID, finalizedAt: new Date() });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.congregationEventStatus.findUnique.mockResolvedValue(null);
      prismaMock.congregationEventStatus.upsert.mockResolvedValue(upserted as never);

      const result = await service.updateStatus(EVENT_ID, CONGREGATION_ID, user, { status: 'FINALIZED' });

      expect(result.status).toBe('FINALIZED');
      expect(prismaMock.congregationEventStatus.upsert).toHaveBeenCalled();
    });

    it('deve permitir CC/CA reabrir lista (PENDING) deletando o registro', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });

      const currentStatus = buildStatus({ status: 'FINALIZED' });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.congregationEventStatus.findUnique.mockResolvedValue(currentStatus as never);
      prismaMock.congregationEventStatus.delete.mockResolvedValue(currentStatus as never);

      const result = await service.updateStatus(EVENT_ID, CONGREGATION_ID, user, { status: 'PENDING' });

      expect(result.status).toBe('PENDING');
      expect(result.id).toBeNull();
      expect(prismaMock.congregationEventStatus.delete).toHaveBeenCalledWith({
        where: { id: currentStatus.id },
      });
      expect(prismaMock.congregationEventStatus.upsert).not.toHaveBeenCalled();
    });

    it('deve lançar ForbiddenException quando role de congregação tenta reabrir lista', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());

      await expect(service.updateStatus(EVENT_ID, CONGREGATION_ID, user, { status: 'PENDING' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar ForbiddenException quando role de congregação tenta finalizar lista de outra congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: 'outra-congregacao' });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());

      await expect(service.updateStatus(EVENT_ID, CONGREGATION_ID, user, { status: 'FINALIZED' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar NotFoundException quando evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(EVENT_ID, CONGREGATION_ID, buildUser(), { status: 'FINALIZED' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar UnprocessableEntityException quando evento não está OPEN', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ status: 'CLOSED' }) as never);

      await expect(
        service.updateStatus(EVENT_ID, CONGREGATION_ID, buildUser(), { status: 'FINALIZED' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar NotFoundException quando congregação não pertence ao circuito', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(EVENT_ID, CONGREGATION_ID, buildUser(), { status: 'FINALIZED' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve permitir CC/CA finalizar lista de qualquer congregação', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      const upserted = buildStatus({ status: 'FINALIZED', finalizedById: USER_ID, finalizedAt: new Date() });

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(buildCongregation());
      prismaMock.congregationEventStatus.upsert.mockResolvedValue(upserted as never);

      const result = await service.updateStatus(EVENT_ID, CONGREGATION_ID, user, { status: 'FINALIZED' });

      expect(result.status).toBe('FINALIZED');
    });
  });

  // ── ensureNotFinalized ────────────────────────────────────────────
  describe('ensureNotFinalized', () => {
    it('deve permitir operação quando não há registro (PENDING implícito)', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      prismaMock.congregationEventStatus.findUnique.mockResolvedValue(null);

      await expect(service.ensureNotFinalized(EVENT_ID, CONGREGATION_ID, user, 'inscrições')).resolves.toBeUndefined();
    });

    it('deve permitir operação quando status é PENDING', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      prismaMock.congregationEventStatus.findUnique.mockResolvedValue(buildStatus({ status: 'PENDING' }) as never);

      await expect(service.ensureNotFinalized(EVENT_ID, CONGREGATION_ID, user, 'inscrições')).resolves.toBeUndefined();
    });

    it('deve lançar UnprocessableEntityException quando status é FINALIZED para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      prismaMock.congregationEventStatus.findUnique.mockResolvedValue(buildStatus({ status: 'FINALIZED' }) as never);

      await expect(service.ensureNotFinalized(EVENT_ID, CONGREGATION_ID, user, 'inscrições')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve permitir operação para CC/CA mesmo quando FINALIZED (bypass)', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });

      await expect(service.ensureNotFinalized(EVENT_ID, CONGREGATION_ID, user, 'inscrições')).resolves.toBeUndefined();

      expect(prismaMock.congregationEventStatus.findUnique).not.toHaveBeenCalled();
    });

    it('deve permitir operação para CA mesmo quando FINALIZED (bypass)', async () => {
      const user = buildUser({ role: 'CIRCUIT_ASSISTANT' });

      await expect(service.ensureNotFinalized(EVENT_ID, CONGREGATION_ID, user, 'pagamentos')).resolves.toBeUndefined();

      expect(prismaMock.congregationEventStatus.findUnique).not.toHaveBeenCalled();
    });
  });
});
