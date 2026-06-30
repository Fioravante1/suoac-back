import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PdfService } from '../common/pdf/pdf.service';
import { XlsxService } from '../common/xlsx/xlsx.service';
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
const DAY_ID_2 = 'd1d2d3d4-0000-0000-0000-000000000002';
const EP_ID_1 = 'ep000001-0000-0000-0000-000000000001';
const EP_ID_2 = 'ep000002-0000-0000-0000-000000000002';

// ── GroupBy with _sum entry helper ───────────────────────────────
interface GroupByEntry {
  paymentStatus: string;
  _count: number;
  _sum: { totalAmount: number | null; paidAmount: number | null };
}

function gb(paymentStatus: string, count: number, totalAmount: number, paidAmount: number): GroupByEntry {
  return { paymentStatus, _count: count, _sum: { totalAmount, paidAmount } };
}

// ── Default breakdown (with _sum): 3 PAID(75/75) + 2 PARTIAL(50/20) + 4 PENDING(100/0) + 1 EXEMPT(25/0) ──
// totalPassengers = 10, totalExpected = 225 (sem EXEMPT), totalReceived = 95, totalPending = 130
function defaultBreakdown(): GroupByEntry[] {
  return [gb('PAID', 3, 75, 75), gb('PARTIAL', 2, 50, 20), gb('PENDING', 4, 100, 0), gb('EXEMPT', 1, 25, 0)];
}

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
  let pdfServiceMock: jest.Mocked<PdfService>;
  let xlsxServiceMock: jest.Mocked<XlsxService>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    pdfServiceMock = {
      generateFinancialSummaryPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
    } as unknown as jest.Mocked<PdfService>;
    xlsxServiceMock = {
      generateFinancialSummary: jest.fn().mockResolvedValue(Buffer.from('PK\x03\x04')),
    } as unknown as jest.Mocked<XlsxService>;

    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: PdfService, useValue: pdfServiceMock },
        { provide: XlsxService, useValue: xlsxServiceMock },
        { provide: AuditLogService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(DashboardService);
  });

  // ── getDashboard (congregation-level) ──────────────────────────
  describe('getDashboard (congregation-level)', () => {
    function setupCongregationMocks(
      overrides: {
        event?: PrismaEvent;
        congregation?: PrismaCongregation;
        breakdown?: GroupByEntry[];
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
      (prismaMock.eventPassenger.groupBy as unknown as jest.Mock).mockResolvedValue(
        overrides.breakdown ?? defaultBreakdown(),
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
      setupCongregationMocks();

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.event.id).toBe(EVENT_ID);
      expect(result.event.title).toBe('Assembleia de Circuito');
      expect(result.event.ticketPrice).toBe('25');
      expect(result.event.days).toHaveLength(1);
      expect(result.congregation).not.toBeNull();
      expect(result.congregation!.id).toBe(CONGREGATION_ID);
      expect(result.congregation!.name).toBe('Congregação Central');
      expect(result.congregation!.listStatus).toBe('PENDING');
      expect(result.stats.totalPassengers).toBe(10);
      // EXEMPT(25) excluído dos totais monetários: expected=225, received=95, pending=130
      expect(result.stats.totalExpected).toBe('225.00');
      expect(result.stats.totalReceived).toBe('95.00');
      expect(result.stats.totalPending).toBe('130.00');
      expect(result.paymentBreakdown).toEqual({ paid: 3, partial: 2, pending: 4, exempt: 1 });
      expect(result.pendingPassengers).toHaveLength(2);
      expect(result.totalPendingPassengers).toBe(6);
    });

    it('deve retornar dashboard para role de circuito com congregationId no query', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupCongregationMocks();

      const result = await service.getDashboard(EVENT_ID, user, CONGREGATION_ID);

      expect(result.event.id).toBe(EVENT_ID);
      expect(result.congregation).not.toBeNull();
      expect(result.congregation!.id).toBe(CONGREGATION_ID);
    });

    it('deve retornar passengersByDay vazio para evento de um único dia (assembleia)', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      setupCongregationMocks();

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.passengersByDay).toEqual([]);
      expect(prismaMock.eventPassengerDay.groupBy).not.toHaveBeenCalled();
    });

    it('deve retornar contagem por dia escopada à congregação em evento multi-dia', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      const multiDayEvent = buildEvent({
        type: 'REGIONAL_CONVENTION',
        eventDays: [
          buildEventDay(),
          buildEventDay({ id: DAY_ID_2, dayNumber: 2, label: 'Dia 2 - Domingo', date: new Date('2026-06-02') }),
        ],
      });
      setupCongregationMocks({ event: multiDayEvent });
      (prismaMock.eventPassengerDay.groupBy as unknown as jest.Mock).mockResolvedValue([
        { eventDayId: DAY_ID_1, _count: 8 },
        { eventDayId: DAY_ID_2, _count: 5 },
      ]);

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.passengersByDay).toEqual([
        {
          eventDayId: DAY_ID_1,
          dayNumber: 1,
          label: 'Dia 1 - Sábado',
          date: new Date('2026-06-01'),
          totalPassengers: 8,
        },
        {
          eventDayId: DAY_ID_2,
          dayNumber: 2,
          label: 'Dia 2 - Domingo',
          date: new Date('2026-06-02'),
          totalPassengers: 5,
        },
      ]);
      expect(prismaMock.eventPassengerDay.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['eventDayId'],
          where: { eventPassenger: { eventId: EVENT_ID, congregationId: CONGREGATION_ID } },
        }),
      );
    });

    it('deve retornar 0 para dia sem inscritos em evento multi-dia', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      const multiDayEvent = buildEvent({
        type: 'REGIONAL_CONVENTION',
        eventDays: [
          buildEventDay(),
          buildEventDay({ id: DAY_ID_2, dayNumber: 2, label: 'Dia 2 - Domingo', date: new Date('2026-06-02') }),
        ],
      });
      setupCongregationMocks({ event: multiDayEvent });
      (prismaMock.eventPassengerDay.groupBy as unknown as jest.Mock).mockResolvedValue([
        { eventDayId: DAY_ID_1, _count: 8 },
      ]);

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.passengersByDay[1]?.totalPassengers).toBe(0);
    });

    it('deve lançar NotFoundException quando evento não existe', async () => {
      const user = buildUser();
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.getDashboard(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando congregação não existe', async () => {
      const user = buildUser();
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.getDashboard(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException quando congregação está inativa', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.congregation.findFirst.mockResolvedValue(null);

      await expect(service.getDashboard(EVENT_ID, user, CONGREGATION_ID)).rejects.toThrow(NotFoundException);
      expect(prismaMock.congregation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CONGREGATION_ID, circuitId: CIRCUIT_ID, isActive: true } }),
      );
    });

    it('deve lançar ForbiddenException quando circuito do evento não coincide', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);

      await expect(service.getDashboard(EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando role de congregação sem congregationId', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);

      await expect(service.getDashboard(EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException quando evento está DRAFT para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ status: 'DRAFT' }) as never);

      await expect(service.getDashboard(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve permitir acesso a evento DRAFT para role de circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupCongregationMocks({ event: buildEvent({ status: 'DRAFT' }) });

      const result = await service.getDashboard(EVENT_ID, user, CONGREGATION_ID);

      expect(result.event.status).toBe('DRAFT');
    });

    it('deve retornar listStatus PENDING quando não há registro de status', async () => {
      const user = buildUser();
      setupCongregationMocks({ status: null });

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.congregation!.listStatus).toBe('PENDING');
    });

    it('deve retornar listStatus FINALIZED quando congregação finalizou', async () => {
      const user = buildUser();
      setupCongregationMocks({
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

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.congregation!.listStatus).toBe('FINALIZED');
    });

    it('deve retornar paymentBreakdown com zeros quando não há inscritos', async () => {
      const user = buildUser();
      setupCongregationMocks({
        breakdown: [],
        pendingPassengers: [],
        totalPendingCount: 0,
      });

      const result = await service.getDashboard(EVENT_ID, user);

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
      setupCongregationMocks({ pendingPassengers: fivePassengers, totalPendingCount: 12 });

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.pendingPassengers).toHaveLength(5);
      expect(result.totalPendingPassengers).toBe(12);
      expect(prismaMock.eventPassenger.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it('deve excluir EXEMPT dos totais monetários', async () => {
      const user = buildUser();
      // 5 PAID(125/125) + 3 EXEMPT(75/0)
      setupCongregationMocks({ breakdown: [gb('PAID', 5, 125, 125), gb('EXEMPT', 3, 75, 0)] });

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.stats.totalPassengers).toBe(8); // inclui EXEMPT na contagem
      expect(result.stats.totalExpected).toBe('125.00'); // exclui EXEMPT dos monetários
      expect(result.stats.totalReceived).toBe('125.00');
      expect(result.stats.totalPending).toBe('0.00');
      expect(result.paymentBreakdown.exempt).toBe(3); // EXEMPT continua no breakdown
    });

    it('deve mapear pendingPassengers com pendingAmount calculado', async () => {
      const user = buildUser();
      setupCongregationMocks({
        pendingPassengers: [buildPendingPassenger({ totalAmount: 75.0, paidAmount: 30.0, paymentStatus: 'PARTIAL' })],
      });

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.pendingPassengers[0]!.totalAmount).toBe('75.00');
      expect(result.pendingPassengers[0]!.paidAmount).toBe('30.00');
      expect(result.pendingPassengers[0]!.pendingAmount).toBe('45.00');
      expect(result.pendingPassengers[0]!.paymentStatus).toBe('PARTIAL');
    });

    it('deve usar congregationId do JWT para role de congregação (ignora query param)', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      setupCongregationMocks();

      await service.getDashboard(EVENT_ID, user, 'outro-congregation-id');

      expect(prismaMock.congregation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: CONGREGATION_ID }) }),
      );
    });
  });

  // ── getDashboard (circuit-level) ──────────────────────────────
  describe('getDashboard (circuit-level)', () => {
    function setupCircuitMocks(
      overrides: {
        event?: PrismaEvent;
        breakdown?: GroupByEntry[];
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
      (prismaMock.eventPassenger.groupBy as unknown as jest.Mock).mockResolvedValue(
        overrides.breakdown ?? [
          gb('PAID', 20, 500, 500),
          gb('PARTIAL', 10, 250, 100),
          gb('PENDING', 15, 375, 0),
          gb('EXEMPT', 5, 125, 0),
        ],
      );
      prismaMock.eventPassenger.findMany.mockResolvedValue(
        (overrides.pendingPassengers ?? [
          buildPendingPassenger({ id: EP_ID_1, name: 'Ana Costa', paidAmount: 10.0, paymentStatus: 'PARTIAL' }),
          buildPendingPassenger({ id: EP_ID_2, name: 'Carlos Lima', paidAmount: 0, paymentStatus: 'PENDING' }),
        ]) as never,
      );
      prismaMock.eventPassenger.count.mockResolvedValue(overrides.totalPendingCount ?? 25);
    }

    it('deve retornar dashboard circuit-level quando circuito sem congregationId', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupCircuitMocks();

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.event.id).toBe(EVENT_ID);
      expect(result.congregation).toBeNull();
      expect(result.stats.totalPassengers).toBe(50); // inclui EXEMPT
      // EXEMPT(125) excluído: expected=1125, received=600, pending=525
      expect(result.stats.totalExpected).toBe('1125.00');
      expect(result.stats.totalReceived).toBe('600.00');
      expect(result.stats.totalPending).toBe('525.00');
      expect(result.paymentBreakdown).toEqual({ paid: 20, partial: 10, pending: 15, exempt: 5 });
      expect(result.pendingPassengers).toHaveLength(2);
      expect(result.totalPendingPassengers).toBe(25);
    });

    it('deve fazer queries sem filtro de congregationId para circuit-level', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupCircuitMocks();

      await service.getDashboard(EVENT_ID, user);

      expect(prismaMock.congregation.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.congregationEventStatus.findUnique).not.toHaveBeenCalled();
    });

    it('deve retornar circuit-level para CIRCUIT_ASSISTANT sem congregationId', async () => {
      const user = buildUser({ role: 'CIRCUIT_ASSISTANT', congregationId: null });
      setupCircuitMocks();

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.congregation).toBeNull();
      expect(result.stats.totalPassengers).toBe(50);
    });

    it('deve retornar contagem por dia do circuito inteiro (sem filtro de congregação) em evento multi-dia', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      const multiDayEvent = buildEvent({
        type: 'REGIONAL_CONVENTION',
        eventDays: [
          buildEventDay(),
          buildEventDay({ id: DAY_ID_2, dayNumber: 2, label: 'Dia 2 - Domingo', date: new Date('2026-06-02') }),
        ],
      });
      setupCircuitMocks({ event: multiDayEvent });
      (prismaMock.eventPassengerDay.groupBy as unknown as jest.Mock).mockResolvedValue([
        { eventDayId: DAY_ID_1, _count: 40 },
        { eventDayId: DAY_ID_2, _count: 33 },
      ]);

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.passengersByDay).toHaveLength(2);
      expect(result.passengersByDay[0]?.totalPassengers).toBe(40);
      expect(result.passengersByDay[1]?.totalPassengers).toBe(33);
      expect(prismaMock.eventPassengerDay.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['eventDayId'],
          where: { eventPassenger: { eventId: EVENT_ID } },
        }),
      );
    });

    it('deve retornar passengersByDay vazio em evento de um único dia (circuito)', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupCircuitMocks();

      const result = await service.getDashboard(EVENT_ID, user);

      expect(result.passengersByDay).toEqual([]);
      expect(prismaMock.eventPassengerDay.groupBy).not.toHaveBeenCalled();
    });
  });

  // ── getFinancialSummary ──────────────────────────────────────
  describe('getFinancialSummary', () => {
    const CONGREGATION_ID_2 = 'c2c2c3c4-0000-0000-0000-000000000002';

    function setupFinancialMocks(
      overrides: {
        event?: PrismaEvent;
        breakdown?: GroupByEntry[];
        groupByRows?: Array<{
          congregationId: string;
          paymentStatus: string;
          _count: number;
          _sum: { totalAmount: number | null; paidAmount: number | null };
        }>;
        congregations?: Array<{ id: string; name: string }>;
      } = {},
    ): void {
      prismaMock.event.findUnique.mockResolvedValue((overrides.event ?? buildEvent()) as never);
      (prismaMock.eventPassenger.groupBy as unknown as jest.Mock)
        .mockResolvedValueOnce(
          overrides.breakdown ?? [
            gb('PAID', 15, 375, 375),
            gb('PARTIAL', 5, 125, 50),
            gb('PENDING', 8, 200, 0),
            gb('EXEMPT', 2, 50, 0),
          ],
        )
        .mockResolvedValueOnce(
          overrides.groupByRows ?? [
            {
              congregationId: CONGREGATION_ID,
              paymentStatus: 'PAID',
              _count: 10,
              _sum: { totalAmount: 250.0, paidAmount: 250.0 },
            },
            {
              congregationId: CONGREGATION_ID,
              paymentStatus: 'PENDING',
              _count: 5,
              _sum: { totalAmount: 125.0, paidAmount: 0 },
            },
            {
              congregationId: CONGREGATION_ID_2,
              paymentStatus: 'PAID',
              _count: 5,
              _sum: { totalAmount: 125.0, paidAmount: 125.0 },
            },
            {
              congregationId: CONGREGATION_ID_2,
              paymentStatus: 'PARTIAL',
              _count: 5,
              _sum: { totalAmount: 125.0, paidAmount: 50.0 },
            },
          ],
        );
      prismaMock.congregation.findMany.mockResolvedValue(
        (overrides.congregations ?? [
          { id: CONGREGATION_ID, name: 'Congregação Central' },
          { id: CONGREGATION_ID_2, name: 'Congregação Norte' },
        ]) as never,
      );
    }

    it('deve retornar financial summary com totais e breakdown por congregação para circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupFinancialMocks();

      const result = await service.getFinancialSummary(EVENT_ID, user);

      expect(result.eventId).toBe(EVENT_ID);
      expect(result.eventTitle).toBe('Assembleia de Circuito');
      expect(result.ticketPrice).toBe('25');
      expect(result.totals.totalPassengers).toBe(30); // inclui EXEMPT
      // EXEMPT(50) excluído: expected=700, received=425, pending=275
      expect(result.totals.totalExpected).toBe('700.00');
      expect(result.totals.totalReceived).toBe('425.00');
      expect(result.totals.totalPending).toBe('275.00');
      expect(result.totals.byStatus).toEqual({ paid: 15, partial: 5, pending: 8, exempt: 2 });
      expect(result.congregations).toHaveLength(2);
    });

    it('deve ordenar congregações por nome', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupFinancialMocks();

      const result = await service.getFinancialSummary(EVENT_ID, user);

      expect(result.congregations[0]!.congregationName).toBe('Congregação Central');
      expect(result.congregations[1]!.congregationName).toBe('Congregação Norte');
    });

    it('deve calcular totais por congregação corretamente', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupFinancialMocks();

      const result = await service.getFinancialSummary(EVENT_ID, user);

      const central = result.congregations.find((c) => c.congregationId === CONGREGATION_ID);
      expect(central).toBeDefined();
      expect(central!.totalPassengers).toBe(15);
      expect(central!.totalExpected).toBe('375.00');
      expect(central!.totalReceived).toBe('250.00');
      expect(central!.totalPending).toBe('125.00');
      expect(central!.byStatus).toEqual({ paid: 10, partial: 0, pending: 5, exempt: 0 });
    });

    it('deve excluir EXEMPT dos totais monetários por congregação', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupFinancialMocks({
        groupByRows: [
          {
            congregationId: CONGREGATION_ID,
            paymentStatus: 'PAID',
            _count: 5,
            _sum: { totalAmount: 125.0, paidAmount: 125.0 },
          },
          {
            congregationId: CONGREGATION_ID,
            paymentStatus: 'EXEMPT',
            _count: 3,
            _sum: { totalAmount: 75.0, paidAmount: 0 },
          },
        ],
        congregations: [{ id: CONGREGATION_ID, name: 'Central' }],
      });

      const result = await service.getFinancialSummary(EVENT_ID, user);

      const central = result.congregations[0]!;
      expect(central.totalPassengers).toBe(8); // inclui EXEMPT
      expect(central.totalExpected).toBe('125.00'); // exclui EXEMPT
      expect(central.totalReceived).toBe('125.00');
      expect(central.totalPending).toBe('0.00');
      expect(central.byStatus.exempt).toBe(3);
    });

    it('deve retornar apenas a própria congregação para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      setupFinancialMocks({
        breakdown: [gb('PAID', 10, 250, 250), gb('PENDING', 5, 125, 0)],
        groupByRows: [
          {
            congregationId: CONGREGATION_ID,
            paymentStatus: 'PAID',
            _count: 10,
            _sum: { totalAmount: 250.0, paidAmount: 250.0 },
          },
          {
            congregationId: CONGREGATION_ID,
            paymentStatus: 'PENDING',
            _count: 5,
            _sum: { totalAmount: 125.0, paidAmount: 0 },
          },
        ],
        congregations: [{ id: CONGREGATION_ID, name: 'Congregação Central' }],
      });

      const result = await service.getFinancialSummary(EVENT_ID, user);

      expect(result.congregations).toHaveLength(1);
      expect(result.congregations[0]!.congregationId).toBe(CONGREGATION_ID);
    });

    it('deve lançar ForbiddenException quando role de congregação sem congregationId', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);

      await expect(service.getFinancialSummary(EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException quando evento não existe', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.getFinancialSummary(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuito do evento não coincide', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', circuitId: 'outro-circuito', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);

      await expect(service.getFinancialSummary(EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException quando evento está DRAFT para role de congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR' });
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ status: 'DRAFT' }) as never);

      await expect(service.getFinancialSummary(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });

    it('deve retornar congregations vazio quando não há inscritos', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      setupFinancialMocks({
        breakdown: [],
        groupByRows: [],
        congregations: [],
      });

      const result = await service.getFinancialSummary(EVENT_ID, user);

      expect(result.totals.totalPassengers).toBe(0);
      expect(result.congregations).toHaveLength(0);
    });
  });

  // ── exportFinancialSummary ─────────────────────────────────────
  describe('exportFinancialSummary', () => {
    const MOCK_SUMMARY = {
      eventId: EVENT_ID,
      eventTitle: 'Congresso 2026',
      ticketPrice: '50.00',
      totals: {
        totalPassengers: 2,
        totalExpected: '100.00',
        totalReceived: '60.00',
        totalPending: '40.00',
        byStatus: { paid: 1, partial: 1, pending: 0, exempt: 0 },
      },
      congregations: [
        {
          congregationId: CONGREGATION_ID,
          congregationName: 'Central',
          totalPassengers: 2,
          totalExpected: '100.00',
          totalReceived: '60.00',
          totalPending: '40.00',
          byStatus: { paid: 1, partial: 1, pending: 0, exempt: 0 },
        },
      ],
    };

    beforeEach(() => {
      jest.spyOn(service, 'getFinancialSummary').mockResolvedValue(MOCK_SUMMARY);
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.user.findUnique.mockResolvedValue({ name: 'João' } as never);
    });

    it('deve gerar PDF por padrão (delegando ao PdfService)', async () => {
      const result = await service.exportFinancialSummary(CIRCUIT_ID, EVENT_ID, buildUser(), 'pdf');

      expect(pdfServiceMock.generateFinancialSummaryPdf).toHaveBeenCalled();
      expect(xlsxServiceMock.generateFinancialSummary).not.toHaveBeenCalled();
      expect(result.contentType).toBe('application/pdf');
      expect(result.filename).toBe(`resumo-financeiro-${EVENT_ID}.pdf`);
    });

    it('deve gerar XLSX quando format=xlsx (delegando ao XlsxService)', async () => {
      const result = await service.exportFinancialSummary(CIRCUIT_ID, EVENT_ID, buildUser(), 'xlsx');

      expect(xlsxServiceMock.generateFinancialSummary).toHaveBeenCalled();
      expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.filename).toBe(`resumo-financeiro-${EVENT_ID}.xlsx`);
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.exportFinancialSummary(CIRCUIT_ID, EVENT_ID, buildUser(), 'pdf')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException quando o evento é de outro circuito (cross-circuit)', async () => {
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: 'outro-circuito' } as never);

      await expect(service.exportFinancialSummary(CIRCUIT_ID, EVENT_ID, buildUser(), 'pdf')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
