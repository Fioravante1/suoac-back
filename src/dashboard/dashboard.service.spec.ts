import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

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
  title: string;
  type: string;
  ticketPrice: unknown;
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
  eventDays: PrismaEventDay[];
}

interface PrismaCongregation {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  circuitId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'circuit-1';
const DAY_ID_1 = 'd1d2d3d4-0000-0000-0000-000000000001';
const EP_ID_1 = 'ep000001-0000-0000-0000-000000000001';
const EP_ID_2 = 'ep000002-0000-0000-0000-000000000002';

// ── Helpers ──────────────────────────────────────────────────────
function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'user@test.com',
    role: overrides.role ?? 'CONGREGATION_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : CONGREGATION_ID,
  };
}

function buildEventDay(overrides: Partial<PrismaEventDay> = {}): PrismaEventDay {
  return {
    id: overrides.id ?? DAY_ID_1,
    dayNumber: overrides.dayNumber ?? 1,
    date: overrides.date ?? new Date('2026-06-01'),
    label: overrides.label ?? 'Dia 1 - Sábado',
    departureTime: overrides.departureTime ?? '06:00',
    returnTime: overrides.returnTime ?? '22:00',
    status: overrides.status ?? 'ACTIVE',
    eventId: overrides.eventId ?? EVENT_ID,
  };
}

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? EVENT_ID,
    title: overrides.title ?? 'Assembleia de Circuito',
    type: overrides.type ?? 'ASSEMBLY',
    ticketPrice: overrides.ticketPrice ?? 25.0,
    status: overrides.status ?? 'OPEN',
    registrationDeadline: overrides.registrationDeadline ?? new Date('2099-12-31T23:59:59Z'),
    paymentDeadline: overrides.paymentDeadline ?? new Date('2099-12-31T23:59:59Z'),
    venue: overrides.venue ?? 'Salão',
    address: overrides.address ?? 'Rua A',
    city: overrides.city ?? 'São Paulo',
    state: overrides.state ?? 'SP',
    observations: overrides.observations ?? null,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    createdById: overrides.createdById ?? USER_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    eventDays: overrides.eventDays ?? [buildEventDay()],
  };
}

function buildCongregation(overrides: Partial<PrismaCongregation> = {}): PrismaCongregation {
  return {
    id: overrides.id ?? CONGREGATION_ID,
    name: overrides.name ?? 'Congregação Central',
    code: overrides.code ?? 'CC-001',
    email: overrides.email ?? 'central@test.com',
    phone: overrides.phone ?? null,
    isActive: overrides.isActive ?? true,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildPendingPassenger(
  overrides: { id?: string; name?: string; totalAmount?: number; paidAmount?: number; paymentStatus?: string } = {},
): {
  id: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  passenger: { name: string };
} {
  return {
    id: overrides.id ?? EP_ID_1,
    totalAmount: overrides.totalAmount ?? 25.0,
    paidAmount: overrides.paidAmount ?? 0,
    paymentStatus: overrides.paymentStatus ?? 'PENDING',
    passenger: { name: overrides.name ?? 'João Silva' },
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('DashboardService', () => {
  let service: DashboardService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: { client: prismaMock } }],
    }).compile();

    service = module.get(DashboardService);
  });

  // ── getCongregationDashboard ──────────────────────────────────
  describe('getCongregationDashboard', () => {
    function setupSuccessMocks(
      overrides: {
        event?: PrismaEvent;
        congregation?: PrismaCongregation;
        aggregateCount?: number;
        sumTotalAmount?: number;
        sumPaidAmount?: number;
        breakdown?: Array<{ paymentStatus: string; _count: number }>;
        status?: {
          id: string;
          status: string;
          congregationId: string;
          eventId: string;
          finalizedById: string | null;
          finalizedAt: Date | null;
          createdAt: Date;
        } | null;
        pendingPassengers?: Array<{
          id: string;
          totalAmount: number;
          paidAmount: number;
          paymentStatus: string;
          passenger: { name: string };
        }>;
        totalPendingCount?: number;
      } = {},
    ): void {
      prismaMock.event.findUnique.mockResolvedValue((overrides.event ?? buildEvent()) as never);
      prismaMock.congregation.findFirst.mockResolvedValue((overrides.congregation ?? buildCongregation()) as never);
      prismaMock.eventPassenger.aggregate.mockResolvedValue({
        _count: overrides.aggregateCount ?? 10,
        _sum: {
          totalAmount: overrides.sumTotalAmount ?? 250.0,
          paidAmount: overrides.sumPaidAmount ?? 100.0,
        },
        _min: {},
        _max: {},
        _avg: {},
      } as never);
      (prismaMock.eventPassenger.groupBy as unknown as jest.Mock).mockResolvedValue(
        overrides.breakdown ?? [
          { paymentStatus: 'PAID', _count: 3 },
          { paymentStatus: 'PARTIAL', _count: 2 },
          { paymentStatus: 'PENDING', _count: 4 },
          { paymentStatus: 'EXEMPT', _count: 1 },
        ],
      );
      prismaMock.congregationEventStatus.findUnique.mockResolvedValue(
        overrides.status !== undefined ? (overrides.status as never) : null,
      );
      prismaMock.eventPassenger.findMany.mockResolvedValue(
        (overrides.pendingPassengers ?? [
          buildPendingPassenger({
            id: EP_ID_1,
            name: 'Ana Costa',
            totalAmount: 25.0,
            paidAmount: 10.0,
            paymentStatus: 'PARTIAL',
          }),
          buildPendingPassenger({
            id: EP_ID_2,
            name: 'Carlos Lima',
            totalAmount: 25.0,
            paidAmount: 0,
            paymentStatus: 'PENDING',
          }),
        ]) as never,
      );
      prismaMock.eventPassenger.count.mockResolvedValue(overrides.totalPendingCount ?? 6);
    }

    it('deve retornar dashboard completo para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      setupSuccessMocks();

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.event.id).toBe(EVENT_ID);
      expect(result.event.title).toBe('Assembleia de Circuito');
      expect(result.event.ticketPrice).toBe('25');
      expect(result.event.days).toHaveLength(1);
      expect(result.congregation.id).toBe(CONGREGATION_ID);
      expect(result.congregation.name).toBe('Congregação Central');
      expect(result.congregation.listStatus).toBe('PENDING');
      expect(result.stats.totalPassengers).toBe(10);
      expect(result.stats.totalExpected).toBe('250.00');
      expect(result.stats.totalReceived).toBe('100.00');
      expect(result.stats.totalPending).toBe('150.00');
      expect(result.paymentBreakdown).toEqual({ paid: 3, partial: 2, pending: 4, exempt: 1 });
      expect(result.pendingPassengers).toHaveLength(2);
      expect(result.totalPendingPassengers).toBe(6);
    });

    it('deve retornar dashboard para role de circuito com congregationId no query', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupSuccessMocks();

      const result = await service.getCongregationDashboard(EVENT_ID, user, CONGREGATION_ID);

      expect(result.event.id).toBe(EVENT_ID);
      expect(result.congregation.id).toBe(CONGREGATION_ID);
      expect(prismaMock.eventPassenger.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: EVENT_ID, congregationId: CONGREGATION_ID },
        }),
      );
    });

    it('deve lançar UnprocessableEntityException quando role de circuito sem congregationId', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });

      await expect(service.getCongregationDashboard(EVENT_ID, user)).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar NotFoundException quando evento não existe', async () => {
      const user = buildUser();
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.getCongregationDashboard(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando congregação não existe', async () => {
      const user = buildUser();
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.getCongregationDashboard(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando congregação está inativa', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.getCongregationDashboard(EVENT_ID, user, CONGREGATION_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.congregation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CONGREGATION_ID, circuitId: CIRCUIT_ID, isActive: true } }),
      );
    });

    it('deve lançar ForbiddenException quando circuito do evento não coincide', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);

      await expect(service.getCongregationDashboard(EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException quando evento está DRAFT para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ status: 'DRAFT' }) as never);

      await expect(service.getCongregationDashboard(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve permitir acesso a evento DRAFT para role de circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupSuccessMocks({ event: buildEvent({ status: 'DRAFT' }) });

      const result = await service.getCongregationDashboard(EVENT_ID, user, CONGREGATION_ID);

      expect(result.event.status).toBe('DRAFT');
    });

    it('deve retornar listStatus PENDING quando não há registro de status', async () => {
      const user = buildUser();
      setupSuccessMocks({ status: null });

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.congregation.listStatus).toBe('PENDING');
    });

    it('deve retornar listStatus FINALIZED quando congregação finalizou', async () => {
      const user = buildUser();
      setupSuccessMocks({
        status: {
          id: 'status-1',
          status: 'FINALIZED',
          congregationId: CONGREGATION_ID,
          eventId: EVENT_ID,
          finalizedById: USER_ID,
          finalizedAt: new Date(),
          createdAt: new Date(),
        },
      });

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.congregation.listStatus).toBe('FINALIZED');
    });

    it('deve retornar paymentBreakdown com zeros quando não há inscritos', async () => {
      const user = buildUser();
      setupSuccessMocks({
        aggregateCount: 0,
        sumTotalAmount: 0,
        sumPaidAmount: 0,
        breakdown: [],
        pendingPassengers: [],
        totalPendingCount: 0,
      });

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.stats.totalPassengers).toBe(0);
      expect(result.stats.totalExpected).toBe('0.00');
      expect(result.stats.totalReceived).toBe('0.00');
      expect(result.stats.totalPending).toBe('0.00');
      expect(result.paymentBreakdown).toEqual({ paid: 0, partial: 0, pending: 0, exempt: 0 });
      expect(result.pendingPassengers).toHaveLength(0);
      expect(result.totalPendingPassengers).toBe(0);
    });

    it('deve limitar pendingPassengers a 5 registros', async () => {
      const user = buildUser();
      const fivePassengers = Array.from({ length: 5 }, (_, i) =>
        buildPendingPassenger({ id: `ep-${i}`, name: `Passageiro ${i}` }),
      );
      setupSuccessMocks({ pendingPassengers: fivePassengers, totalPendingCount: 12 });

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.pendingPassengers).toHaveLength(5);
      expect(result.totalPendingPassengers).toBe(12);
      expect(prismaMock.eventPassenger.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it('deve calcular totalPending como totalExpected - totalReceived', async () => {
      const user = buildUser();
      setupSuccessMocks({ sumTotalAmount: 500.0, sumPaidAmount: 175.5 });

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.stats.totalExpected).toBe('500.00');
      expect(result.stats.totalReceived).toBe('175.50');
      expect(result.stats.totalPending).toBe('324.50');
    });

    it('deve mapear pendingPassengers com pendingAmount calculado', async () => {
      const user = buildUser();
      setupSuccessMocks({
        pendingPassengers: [buildPendingPassenger({ totalAmount: 75.0, paidAmount: 30.0, paymentStatus: 'PARTIAL' })],
      });

      const result = await service.getCongregationDashboard(EVENT_ID, user);

      expect(result.pendingPassengers[0]!.totalAmount).toBe('75.00');
      expect(result.pendingPassengers[0]!.paidAmount).toBe('30.00');
      expect(result.pendingPassengers[0]!.pendingAmount).toBe('45.00');
      expect(result.pendingPassengers[0]!.paymentStatus).toBe('PARTIAL');
    });

    it('deve usar congregationId do JWT para role de congregação (ignora query param)', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      setupSuccessMocks();

      await service.getCongregationDashboard(EVENT_ID, user, 'outro-congregation-id');

      expect(prismaMock.congregation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: CONGREGATION_ID }) }),
      );
    });
  });
});
