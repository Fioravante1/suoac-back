import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

// ── Types ────────────────────────────────────────────────────────
interface PrismaEvent {
  id: string;
  title: string;
  type: string;
  ticketPrice: { toString: () => string };
  status: string;
  registrationDeadline: Date;
  paymentDeadline: Date;
  venue: string;
  address: string;
  city: string;
  state: string;
  observations: string | null;
  circuitId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

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

type PrismaEventWithDays = PrismaEvent & { eventDays: PrismaEventDay[] };

// ── Helpers ──────────────────────────────────────────────────────
const circuitId = 'a1b2c3d4-0000-0000-0000-000000000001';
const userId = 'u1u2u3u4-0000-0000-0000-000000000001';
const eventId = 'e1e2e3e4-0000-0000-0000-000000000001';

function buildCircuit(): { id: string; name: string; city: string; state: string; createdAt: Date; updatedAt: Date } {
  return {
    id: circuitId,
    name: 'SP-019 A',
    city: 'São Paulo',
    state: 'SP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildPrismaEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? eventId,
    title: overrides.title ?? 'Assembleia SP 2026',
    type: overrides.type ?? 'ASSEMBLY',
    ticketPrice: overrides.ticketPrice ?? { toString: () => '25.00' },
    status: overrides.status ?? 'DRAFT',
    registrationDeadline: new Date('2026-06-01T00:00:00Z'),
    paymentDeadline: new Date('2026-06-15T00:00:00Z'),
    venue: overrides.venue ?? 'Salão Central',
    address: overrides.address ?? 'Rua das Flores, 100',
    city: overrides.city ?? 'São Paulo',
    state: overrides.state ?? 'SP',
    observations: overrides.observations ?? null,
    circuitId: overrides.circuitId ?? circuitId,
    createdById: overrides.createdById ?? userId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildEventDay(overrides: Partial<PrismaEventDay> = {}): PrismaEventDay {
  return {
    id: overrides.id ?? 'd1d2d3d4-0000-0000-0000-000000000001',
    dayNumber: overrides.dayNumber ?? 1,
    date: overrides.date ?? new Date('2026-07-10T00:00:00Z'),
    label: overrides.label ?? 'Dia 1 - Sexta-feira',
    departureTime: overrides.departureTime ?? '06:00',
    returnTime: overrides.returnTime ?? '18:00',
    status: overrides.status ?? 'ACTIVE',
    eventId: overrides.eventId ?? eventId,
  };
}

function buildPrismaEventWithDays(
  eventOverrides: Partial<PrismaEvent> = {},
  days?: PrismaEventDay[],
): PrismaEventWithDays {
  return {
    ...buildPrismaEvent(eventOverrides),
    eventDays: days ?? [buildEventDay()],
  };
}

function buildCreateDto(overrides: Partial<CreateEventDto> = {}): CreateEventDto {
  return {
    title: 'Assembleia SP 2026',
    type: 'ASSEMBLY',
    ticketPrice: 25,
    registrationDeadline: '2026-06-01',
    paymentDeadline: '2026-06-15',
    venue: 'Salão Central',
    address: 'Rua das Flores, 100',
    city: 'São Paulo',
    state: 'SP',
    date: '2026-07-10',
    departureTime: '06:00',
    returnTime: '18:00',
    ...overrides,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('EventsService', () => {
  let service: EventsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: { client: prismaMock } }],
    }).compile();

    service = module.get(EventsService);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve criar uma assembleia com 1 dia', async () => {
      const dto = buildCreateDto();

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.event.create.mockResolvedValue(buildPrismaEventWithDays() as never);

      const result = await service.create(circuitId, userId, dto);

      expect(result.title).toBe('Assembleia SP 2026');
      expect(result.ticketPrice).toBe('25.00');
      expect(result.days).toHaveLength(1);
      expect(result.days![0]!.label).toBe('Dia 1 - Sexta-feira');

      expect(prismaMock.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: dto.title,
            type: 'ASSEMBLY',
            eventDays: {
              create: [
                expect.objectContaining({
                  dayNumber: 1,
                  label: 'Dia 1 - Sexta-feira',
                }),
              ],
            },
          }),
        }),
      );
    });

    it('deve criar um congresso regional com 3 dias', async () => {
      const dto = buildCreateDto({
        type: 'REGIONAL_CONVENTION' as CreateEventDto['type'],
        title: 'Congresso Regional 2026',
        date: '2026-07-10',
        endDate: '2026-07-12',
      });

      const days = [
        buildEventDay({ dayNumber: 1, date: new Date('2026-07-10T00:00:00Z'), label: 'Dia 1 - Sexta-feira' }),
        buildEventDay({
          id: 'd2',
          dayNumber: 2,
          date: new Date('2026-07-11T00:00:00Z'),
          label: 'Dia 2 - Sábado',
        }),
        buildEventDay({
          id: 'd3',
          dayNumber: 3,
          date: new Date('2026-07-12T00:00:00Z'),
          label: 'Dia 3 - Domingo',
        }),
      ];

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.event.create.mockResolvedValue(
        buildPrismaEventWithDays({ type: 'REGIONAL_CONVENTION', title: 'Congresso Regional 2026' }, days) as never,
      );

      const result = await service.create(circuitId, userId, dto);

      expect(result.days).toHaveLength(3);
      expect(result.days![0]!.label).toBe('Dia 1 - Sexta-feira');
      expect(result.days![1]!.label).toBe('Dia 2 - Sábado');
      expect(result.days![2]!.label).toBe('Dia 3 - Domingo');

      expect(prismaMock.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventDays: {
              create: expect.arrayContaining([
                expect.objectContaining({ dayNumber: 1, label: 'Dia 1 - Sexta-feira' }),
                expect.objectContaining({ dayNumber: 2, label: 'Dia 2 - Sábado' }),
                expect.objectContaining({ dayNumber: 3, label: 'Dia 3 - Domingo' }),
              ]),
            },
          }),
        }),
      );
    });

    it('deve gerar labels com dias da semana em português', async () => {
      const dto = buildCreateDto({ date: '2026-07-13' }); // Segunda-feira

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.event.create.mockResolvedValue(
        buildPrismaEventWithDays({}, [
          buildEventDay({ date: new Date('2026-07-13T00:00:00Z'), label: 'Dia 1 - Segunda-feira' }),
        ]) as never,
      );

      await service.create(circuitId, userId, dto);

      expect(prismaMock.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventDays: {
              create: [expect.objectContaining({ label: 'Dia 1 - Segunda-feira' })],
            },
          }),
        }),
      );
    });

    it('deve normalizar state para uppercase', async () => {
      const dto = buildCreateDto({ state: 'sp' });

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.event.create.mockResolvedValue(buildPrismaEventWithDays() as never);

      await service.create(circuitId, userId, dto);

      expect(prismaMock.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: 'SP' }),
        }),
      );
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.create(circuitId, userId, buildCreateDto())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar UnprocessableEntityException quando endDate < date para congresso', async () => {
      const dto = buildCreateDto({
        type: 'REGIONAL_CONVENTION' as CreateEventDto['type'],
        date: '2026-07-12',
        endDate: '2026-07-10',
      });

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());

      await expect(service.create(circuitId, userId, dto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar UnprocessableEntityException quando endDate ausente para congresso', async () => {
      const dto = buildCreateDto({
        type: 'REGIONAL_CONVENTION' as CreateEventDto['type'],
        endDate: undefined,
      });

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());

      await expect(service.create(circuitId, userId, dto)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── findByCircuit ─────────────────────────────────────────────
  describe('findByCircuit', () => {
    it('deve retornar lista paginada de eventos', async () => {
      const events = [buildPrismaEvent(), buildPrismaEvent({ id: 'e2' })];

      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.event.findMany.mockResolvedValue(events as never);
      prismaMock.event.count.mockResolvedValue(2);

      const result = await service.findByCircuit(circuitId, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
      expect(result.data[0]).not.toHaveProperty('days');
    });

    it('deve calcular totalPages corretamente', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(buildCircuit());
      prismaMock.event.findMany.mockResolvedValue([buildPrismaEvent()] as never);
      prismaMock.event.count.mockResolvedValue(45);

      const result = await service.findByCircuit(circuitId, 1, 20);

      expect(result.meta.totalPages).toBe(3);
    });

    it('deve lançar NotFoundException quando o circuito não existe', async () => {
      prismaMock.circuit.findUnique.mockResolvedValue(null);

      await expect(service.findByCircuit(circuitId, 1, 20)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findOne ───────────────────────────────────────────────────
  describe('findOne', () => {
    it('deve retornar o evento com dias', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildPrismaEventWithDays() as never);

      const result = await service.findOne(eventId);

      expect(result.id).toBe(eventId);
      expect(result.days).toHaveLength(1);
      expect(result.days![0]!.label).toBe('Dia 1 - Sexta-feira');
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.findOne('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('deve permitir todos os campos editáveis em DRAFT', async () => {
      const event = buildPrismaEvent({ status: 'DRAFT' });
      const updated = buildPrismaEvent({ status: 'DRAFT', title: 'Novo Título' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(updated as never);

      const result = await service.update(eventId, { title: 'Novo Título' });

      expect(result.title).toBe('Novo Título');
    });

    it('deve permitir campos editáveis em OPEN', async () => {
      const event = buildPrismaEvent({ status: 'OPEN' });
      const updated = buildPrismaEvent({ status: 'OPEN', title: 'Novo Título' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(updated as never);

      const result = await service.update(eventId, { title: 'Novo Título' });

      expect(result.title).toBe('Novo Título');
    });

    it('deve permitir apenas observations em CLOSED', async () => {
      const event = buildPrismaEvent({ status: 'CLOSED' });
      const updated = buildPrismaEvent({ status: 'CLOSED', observations: 'Nota atualizada' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(updated as never);

      const result = await service.update(eventId, { observations: 'Nota atualizada' });

      expect(result.observations).toBe('Nota atualizada');
    });

    it('deve rejeitar qualquer campo em FINISHED', async () => {
      const event = buildPrismaEvent({ status: 'FINISHED' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.update(eventId, { title: 'Teste' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve rejeitar campo proibido em OPEN (registrationDeadline)', async () => {
      const event = buildPrismaEvent({ status: 'OPEN' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.update(eventId, { registrationDeadline: '2026-08-01' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve aceitar body vazio sem alterar campos', async () => {
      const event = buildPrismaEvent({ status: 'DRAFT' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(event as never);

      const result = await service.update(eventId, {});

      expect(result).toBeDefined();
      expect(prismaMock.event.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: {},
      });
    });

    it('deve normalizar state para uppercase ao atualizar', async () => {
      const event = buildPrismaEvent({ status: 'DRAFT' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(buildPrismaEvent({ state: 'RJ' }) as never);

      await service.update(eventId, { state: 'rj' });

      expect(prismaMock.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: 'RJ' }),
        }),
      );
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.update('id-inexistente', { title: 'Teste' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── transitionStatus ──────────────────────────────────────────
  describe('transitionStatus', () => {
    it('deve transicionar DRAFT → OPEN com dias ativos', async () => {
      const event = buildPrismaEventWithDays({ status: 'DRAFT' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(buildPrismaEvent({ status: 'OPEN' }) as never);

      const result = await service.transitionStatus(eventId, { status: 'OPEN' });

      expect(result.status).toBe('OPEN');
    });

    it('deve transicionar OPEN → CLOSED', async () => {
      const event = buildPrismaEventWithDays({ status: 'OPEN' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(buildPrismaEvent({ status: 'CLOSED' }) as never);

      const result = await service.transitionStatus(eventId, { status: 'CLOSED' });

      expect(result.status).toBe('CLOSED');
    });

    it('deve transicionar CLOSED → FINISHED', async () => {
      const event = buildPrismaEventWithDays({ status: 'CLOSED' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.update.mockResolvedValue(buildPrismaEvent({ status: 'FINISHED' }) as never);

      const result = await service.transitionStatus(eventId, { status: 'FINISHED' });

      expect(result.status).toBe('FINISHED');
    });

    it('deve rejeitar transição inválida DRAFT → CLOSED', async () => {
      const event = buildPrismaEventWithDays({ status: 'DRAFT' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.transitionStatus(eventId, { status: 'CLOSED' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve rejeitar regressão OPEN → DRAFT', async () => {
      const event = buildPrismaEventWithDays({ status: 'OPEN' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.transitionStatus(eventId, { status: 'DRAFT' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve rejeitar qualquer transição a partir de FINISHED', async () => {
      const event = buildPrismaEventWithDays({ status: 'FINISHED' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.transitionStatus(eventId, { status: 'OPEN' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve rejeitar DRAFT → OPEN sem dias ativos', async () => {
      const event = buildPrismaEventWithDays({ status: 'DRAFT' }, [buildEventDay({ status: 'CANCELLED' })]);

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.transitionStatus(eventId, { status: 'OPEN' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.transitionStatus('id-inexistente', { status: 'OPEN' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve remover evento em DRAFT', async () => {
      const event = buildPrismaEvent({ status: 'DRAFT' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);
      prismaMock.event.delete.mockResolvedValue(event as never);

      await service.remove(eventId);

      expect(prismaMock.event.delete).toHaveBeenCalledWith({ where: { id: eventId } });
    });

    it('deve rejeitar remoção de evento que não está em DRAFT', async () => {
      const event = buildPrismaEvent({ status: 'OPEN' });

      prismaMock.event.findUnique.mockResolvedValue(event as never);

      await expect(service.remove(eventId)).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.remove('id-inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
