import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventDaysService } from './event-days.service';
import type { EventDayResponse } from './interfaces/event-day-response.interface';

// ── Types ────────────────────────────────────────────────────────
interface PrismaEventDay {
  id: string;
  dayNumber: number;
  date: Date;
  label: string;
  departureTime: string;
  returnTime: string;
  status: string;
  eventId: string;
}

interface PrismaEvent {
  id: string;
  status: string;
}

type PrismaEventDayWithEvent = PrismaEventDay & { event: PrismaEvent };

// ── Helpers ──────────────────────────────────────────────────────
const eventId = 'e1e2e3e4-0000-0000-0000-000000000001';
const dayId = 'd1d2d3d4-0000-0000-0000-000000000001';

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? eventId,
    status: overrides.status ?? 'DRAFT',
  };
}

function buildEventDay(overrides: Partial<PrismaEventDay> = {}): PrismaEventDay {
  return {
    id: overrides.id ?? dayId,
    dayNumber: overrides.dayNumber ?? 1,
    date: overrides.date ?? new Date('2026-07-10T00:00:00Z'),
    label: overrides.label ?? 'Dia 1 - Sexta-feira',
    departureTime: overrides.departureTime ?? '06:00',
    returnTime: overrides.returnTime ?? '18:00',
    status: overrides.status ?? 'ACTIVE',
    eventId: overrides.eventId ?? eventId,
  };
}

function buildEventDayWithEvent(
  dayOverrides: Partial<PrismaEventDay> = {},
  eventOverrides: Partial<PrismaEvent> = {},
): PrismaEventDayWithEvent {
  return {
    ...buildEventDay(dayOverrides),
    event: buildEvent(eventOverrides),
  };
}

function buildExpectedDayResponse(overrides: Partial<EventDayResponse> = {}): EventDayResponse {
  return {
    id: overrides.id ?? dayId,
    dayNumber: overrides.dayNumber ?? 1,
    date: overrides.date ?? new Date('2026-07-10T00:00:00Z'),
    label: overrides.label ?? 'Dia 1 - Sexta-feira',
    departureTime: overrides.departureTime ?? '06:00',
    returnTime: overrides.returnTime ?? '18:00',
    status: overrides.status ?? 'ACTIVE',
    eventId: overrides.eventId ?? eventId,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EventDaysService', () => {
  let service: EventDaysService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [EventDaysService, { provide: PrismaService, useValue: { client: prismaMock } }],
    }).compile();

    service = module.get(EventDaysService);
  });

  // ── findByEvent ───────────────────────────────────────────────
  describe('findByEvent', () => {
    it('deve retornar lista ordenada de dias', async () => {
      const days = [
        buildEventDay({ dayNumber: 1 }),
        buildEventDay({ id: 'd2', dayNumber: 2, label: 'Dia 2 - Sábado' }),
      ];

      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.eventDay.findMany.mockResolvedValue(days as never);

      const result = await service.findByEvent(eventId, 'CIRCUIT_COORDINATOR');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(buildExpectedDayResponse());
      expect(result[1]!.dayNumber).toBe(2);
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.findByEvent('id-inexistente', 'CIRCUIT_COORDINATOR')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o dia do evento', async () => {
      prismaMock.eventDay.findUnique.mockResolvedValue(buildEventDay() as never);

      const result = await service.findOne(dayId, 'CIRCUIT_COORDINATOR');

      expect(result).toEqual(buildExpectedDayResponse());
    });

    it('deve lançar NotFoundException quando o dia não existe', async () => {
      prismaMock.eventDay.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente', 'CIRCUIT_COORDINATOR')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve atualizar horários quando evento está em DRAFT', async () => {
      const dayWithEvent = buildEventDayWithEvent({}, { status: 'DRAFT' });
      const updated = buildEventDay({ departureTime: '07:00' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);
      prismaMock.eventDay.update.mockResolvedValue(updated as never);

      const result = await service.update(dayId, { departureTime: '07:00' });

      expect(result.departureTime).toBe('07:00');
    });

    it('deve atualizar horários quando evento está em OPEN', async () => {
      const dayWithEvent = buildEventDayWithEvent({}, { status: 'OPEN' });
      const updated = buildEventDay({ returnTime: '19:00' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);
      prismaMock.eventDay.update.mockResolvedValue(updated as never);

      const result = await service.update(dayId, { returnTime: '19:00' });

      expect(result.returnTime).toBe('19:00');
    });

    it('deve rejeitar edição quando evento está em CLOSED', async () => {
      const dayWithEvent = buildEventDayWithEvent({}, { status: 'CLOSED' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);

      await expect(service.update(dayId, { departureTime: '07:00' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve rejeitar edição quando evento está em FINISHED', async () => {
      const dayWithEvent = buildEventDayWithEvent({}, { status: 'FINISHED' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);

      await expect(service.update(dayId, { departureTime: '07:00' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve rejeitar edição quando dia está cancelado', async () => {
      const dayWithEvent = buildEventDayWithEvent({ status: 'CANCELLED' }, { status: 'DRAFT' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);

      await expect(service.update(dayId, { departureTime: '07:00' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const dayWithEvent = buildEventDayWithEvent({}, { status: 'DRAFT' });
      const updated = buildEventDay();

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);
      prismaMock.eventDay.update.mockResolvedValue(updated as never);

      const result = await service.update(dayId, {});

      expect(result).toEqual(buildExpectedDayResponse());
      expect(prismaMock.eventDay.update).toHaveBeenCalledWith({
        where: { id: dayId },
        data: {},
      });
    });

    it('deve lançar NotFoundException quando o dia não existe', async () => {
      prismaMock.eventDay.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { departureTime: '07:00' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── cancel ────────────────────────────────────────────────────
  describe('cancel', () => {
    it('deve cancelar um dia ativo quando não é o último', async () => {
      const dayWithEvent = buildEventDayWithEvent({ status: 'ACTIVE' }, { status: 'DRAFT' });
      const cancelled = buildEventDay({ status: 'CANCELLED' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);
      prismaMock.eventDay.count.mockResolvedValue(2);
      prismaMock.eventDay.update.mockResolvedValue(cancelled as never);

      const result = await service.cancel(dayId);

      expect(result.status).toBe('CANCELLED');
      expect(prismaMock.eventDay.update).toHaveBeenCalledWith({
        where: { id: dayId },
        data: { status: 'CANCELLED' },
      });
    });

    it('deve cancelar o último dia ativo e definir evento como CANCELLED quando CIRCUIT_COORDINATOR', async () => {
      const dayWithEvent = buildEventDayWithEvent({ status: 'ACTIVE' }, { status: 'OPEN' });
      const cancelledDay = buildEventDay({ status: 'CANCELLED' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);
      prismaMock.eventDay.count.mockResolvedValue(1);
      prismaMock.$transaction.mockResolvedValue([cancelledDay, {}] as never);

      const result = await service.cancel(dayId);

      expect(result.status).toBe('CANCELLED');
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve retornar idempotentemente quando dia já está cancelado', async () => {
      const dayWithEvent = buildEventDayWithEvent({ status: 'CANCELLED' }, { status: 'DRAFT' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);

      const result = await service.cancel(dayId);

      expect(result.status).toBe('CANCELLED');
      expect(prismaMock.eventDay.update).not.toHaveBeenCalled();
    });

    it('deve rejeitar cancelamento quando evento está em CLOSED', async () => {
      const dayWithEvent = buildEventDayWithEvent({ status: 'ACTIVE' }, { status: 'CLOSED' });

      prismaMock.eventDay.findUnique.mockResolvedValue(dayWithEvent as never);

      await expect(service.cancel(dayId)).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar NotFoundException quando o dia não existe', async () => {
      prismaMock.eventDay.findUnique.mockResolvedValue(null);

      await expect(service.cancel('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
