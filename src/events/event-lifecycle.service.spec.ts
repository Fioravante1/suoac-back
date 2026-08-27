import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { EventStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { EventLifecycleService } from './event-lifecycle.service';

// ── Helpers ──────────────────────────────────────────────────────
const CIRCUIT_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';

interface EventSnapshot {
  id: string;
  title: string;
  status: EventStatus;
  circuitId: string;
}

function buildSnapshot(overrides: Partial<EventSnapshot> = {}): EventSnapshot {
  return {
    id: EVENT_ID,
    title: 'Assembleia de Circuito',
    status: EventStatus.OPEN,
    circuitId: CIRCUIT_ID,
    ...overrides,
  };
}

describe('EventLifecycleService', () => {
  let service: EventLifecycleService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let auditLogMock: DeepMockProxy<AuditLogService>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    auditLogMock = mockDeep<AuditLogService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        EventLifecycleService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();

    service = moduleRef.get(EventLifecycleService);

    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue([{ count: 0 }, { count: 0 }]);
  });

  describe('runAutoTransitions', () => {
    it('deve encerrar inscrições de eventos OPEN com prazo de inscrição expirado', async () => {
      const now = new Date('2026-08-27T12:00:00Z');
      prismaMock.event.findMany.mockResolvedValueOnce([buildSnapshot()] as never).mockResolvedValueOnce([] as never);
      prismaMock.$transaction.mockResolvedValueOnce([{ count: 1 }, { count: 1 }] as never);

      const result = await service.runAutoTransitions(now);

      expect(result.closed).toBe(1);
      expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { status: EventStatus.OPEN, registrationDeadline: { lt: now } },
        }),
      );
      expect(prismaMock.event.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [EVENT_ID] }, status: EventStatus.OPEN },
        data: { status: EventStatus.CLOSED },
      });
    });

    it('deve finalizar eventos cujo último dia já passou, a partir do dia seguinte', async () => {
      const now = new Date('2026-08-27T12:00:00Z');
      prismaMock.event.findMany
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([buildSnapshot({ status: EventStatus.CLOSED })] as never);
      prismaMock.$transaction.mockResolvedValueOnce([{ count: 1 }, { count: 1 }] as never);

      const result = await service.runAutoTransitions(now);

      expect(result.finished).toBe(1);
      expect(prismaMock.event.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [EVENT_ID] }, status: { in: [EventStatus.OPEN, EventStatus.CLOSED] } },
        data: { status: EventStatus.FINISHED },
      });
    });

    it('deve considerar o dia de hoje no fuso de São Paulo ao calcular o corte de datas', async () => {
      // 27/08 02:00 UTC ainda é 26/08 em São Paulo (UTC-3)
      const now = new Date('2026-08-27T02:00:00Z');

      await service.runAutoTransitions(now);

      expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: { eventDays: { some: { date: { gte: new Date('2026-08-26T00:00:00.000Z') } } } },
          }),
        }),
      );
    });

    it('não deve finalizar eventos que ainda têm algum dia hoje ou no futuro', async () => {
      const now = new Date('2026-08-27T12:00:00Z');

      await service.runAutoTransitions(now);

      const finishCall = prismaMock.event.findMany.mock.calls[1]?.[0];
      expect(finishCall?.where).toEqual(
        expect.objectContaining({
          status: { in: [EventStatus.OPEN, EventStatus.CLOSED] },
          eventDays: { some: {} },
          NOT: { eventDays: { some: { date: { gte: new Date('2026-08-27T00:00:00.000Z') } } } },
        }),
      );
    });

    it('deve ignorar eventos sem dias cadastrados', async () => {
      await service.runAutoTransitions(new Date('2026-08-27T12:00:00Z'));

      const finishCall = prismaMock.event.findMany.mock.calls[1]?.[0];
      expect(finishCall?.where).toEqual(expect.objectContaining({ eventDays: { some: {} } }));
    });

    it('deve gravar audit log de sistema (sem userId) para cada evento transicionado', async () => {
      prismaMock.event.findMany.mockResolvedValueOnce([buildSnapshot()] as never).mockResolvedValueOnce([] as never);
      prismaMock.$transaction.mockResolvedValueOnce([{ count: 1 }, { count: 1 }] as never);

      await service.runAutoTransitions(new Date('2026-08-27T12:00:00Z'));

      expect(auditLogMock.buildCreateData).toHaveBeenCalledWith('UPDATE', 'Event', EVENT_ID, null, {
        oldValues: { status: EventStatus.OPEN },
        newValues: { status: EventStatus.CLOSED },
        actor: { type: 'SYSTEM', job: 'event-lifecycle', reason: 'REGISTRATION_DEADLINE_EXPIRED' },
      });
    });

    it('não deve abrir transação quando não há eventos elegíveis', async () => {
      const result = await service.runAutoTransitions(new Date('2026-08-27T12:00:00Z'));

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ closed: 0, finished: 0 });
    });
  });

  describe('handleCron', () => {
    it('não deve propagar erro quando a execução falha', async () => {
      prismaMock.event.findMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.handleCron()).resolves.toBeUndefined();
    });
  });
});
