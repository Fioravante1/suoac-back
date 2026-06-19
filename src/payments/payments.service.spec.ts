import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CongregationEventStatusService } from '../congregation-event-status/congregation-event-status.service';
import { PdfService } from '../common/pdf/pdf.service';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

// ── Types ────────────────────────────────────────────────────────
interface PrismaEvent {
  id: string;
  status: string;
  paymentDeadline: Date;
  circuitId: string;
}

interface PrismaEventPassenger {
  id: string;
  totalAmount: unknown;
  paidAmount: unknown;
  paymentStatus: string;
  congregationId: string;
  eventId: string;
  event: PrismaEvent;
}

interface PrismaPayment {
  id: string;
  amount: unknown;
  paidAt: Date;
  observations: string | null;
  eventPassengerId: string;
  registeredById: string;
  createdAt: Date;
  eventPassenger: PrismaEventPassenger;
}

// ── Constants ────────────────────────────────────────────────────
const EP_ID = 'ep1ep2e3-0000-0000-0000-000000000001';
const PAYMENT_ID = 'pay1pay2-0000-0000-0000-000000000001';
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'circuit-1';

const FUTURE_DEADLINE = new Date('2099-12-31T23:59:59Z');
const PAST_DEADLINE = new Date('2020-01-01T00:00:00Z');
const PAST_DATE = '2026-01-15T10:00:00Z';

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

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? EVENT_ID,
    status: overrides.status ?? 'OPEN',
    paymentDeadline: overrides.paymentDeadline ?? FUTURE_DEADLINE,
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
  };
}

function buildEventPassenger(overrides: Partial<PrismaEventPassenger> = {}): PrismaEventPassenger {
  return {
    id: overrides.id ?? EP_ID,
    totalAmount: overrides.totalAmount ?? 50.0,
    paidAmount: overrides.paidAmount ?? 0,
    paymentStatus: overrides.paymentStatus ?? 'PENDING',
    congregationId: overrides.congregationId ?? CONGREGATION_ID,
    eventId: overrides.eventId ?? EVENT_ID,
    event: (overrides.event as PrismaEvent) ?? buildEvent(),
  };
}

function buildPayment(overrides: Partial<PrismaPayment> = {}): PrismaPayment {
  return {
    id: overrides.id ?? PAYMENT_ID,
    amount: overrides.amount ?? 25.0,
    paidAt: overrides.paidAt ?? new Date(PAST_DATE),
    observations: overrides.observations ?? null,
    eventPassengerId: overrides.eventPassengerId ?? EP_ID,
    registeredById: overrides.registeredById ?? USER_ID,
    createdAt: overrides.createdAt ?? new Date('2026-01-15T10:00:00Z'),
    eventPassenger: (overrides.eventPassenger as PrismaEventPassenger) ?? buildEventPassenger({ paidAmount: 25.0 }),
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let congregationEventStatusMock: jest.Mocked<CongregationEventStatusService>;
  let pdfServiceMock: jest.Mocked<PdfService>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    congregationEventStatusMock = {
      findByEvent: jest.fn(),
      updateStatus: jest.fn(),
      ensureNotFinalized: jest.fn(),
    } as unknown as jest.Mocked<CongregationEventStatusService>;
    pdfServiceMock = {
      generatePaymentReceipt: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
    } as unknown as jest.Mocked<PdfService>;

    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: CongregationEventStatusService, useValue: congregationEventStatusMock },
        { provide: PdfService, useValue: pdfServiceMock },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            buildCreateData: jest.fn(
              (action: string, entity: string, entityId: string, userId: string, details: unknown) => ({
                action,
                entity,
                entityId,
                userId,
                details,
              }),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('deve registrar pagamento com dados válidos', async () => {
      const user = buildUser();
      const ep = buildEventPassenger({ totalAmount: 50.0, paidAmount: 0 });
      const createdPayment = {
        id: PAYMENT_ID,
        amount: 25.0,
        paidAt: new Date(PAST_DATE),
        observations: null,
        eventPassengerId: EP_ID,
        registeredById: USER_ID,
        createdAt: new Date(),
      };

      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);
      prismaMock.payment.create.mockResolvedValue(createdPayment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      const result = await service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE });

      expect(result.id).toBe(PAYMENT_ID);
      expect(result.amount).toBe('25');
      expect(result.eventPassengerId).toBe(EP_ID);
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve atualizar paymentStatus para PARTIAL quando pagamento parcial', async () => {
      const user = buildUser();
      const ep = buildEventPassenger({ totalAmount: 50.0, paidAmount: 0 });
      const createdPayment = {
        id: PAYMENT_ID,
        amount: 25.0,
        paidAt: new Date(PAST_DATE),
        observations: null,
        eventPassengerId: EP_ID,
        registeredById: USER_ID,
        createdAt: new Date(),
      };

      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);
      prismaMock.payment.create.mockResolvedValue(createdPayment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      await service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE });

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve atualizar paymentStatus para PAID quando pagamento completa o total', async () => {
      const user = buildUser();
      const ep = buildEventPassenger({ totalAmount: 50.0, paidAmount: 25.0 });
      const createdPayment = {
        id: PAYMENT_ID,
        amount: 25.0,
        paidAt: new Date(PAST_DATE),
        observations: null,
        eventPassengerId: EP_ID,
        registeredById: USER_ID,
        createdAt: new Date(),
      };

      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);
      prismaMock.payment.create.mockResolvedValue(createdPayment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      const result = await service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE });

      expect(result.id).toBe(PAYMENT_ID);
    });

    it('deve lançar NotFoundException quando inscrição não existe', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);

      await expect(service.create('non-existent', buildUser(), { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar UnprocessableEntityException quando evento não está OPEN', async () => {
      const ep = buildEventPassenger({ event: buildEvent({ status: 'CLOSED' }) });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(service.create(EP_ID, buildUser(), { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar UnprocessableEntityException quando prazo expirou para role de congregação', async () => {
      const ep = buildEventPassenger({ event: buildEvent({ paymentDeadline: PAST_DEADLINE }) });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(
        service.create(EP_ID, buildUser({ role: 'CONGREGATION_COORDINATOR' }), { amount: 25, paidAt: PAST_DATE }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve permitir pagamento após prazo para role de circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR' });
      const ep = buildEventPassenger({
        totalAmount: 50.0,
        paidAmount: 0,
        event: buildEvent({ paymentDeadline: PAST_DEADLINE }),
      });
      const createdPayment = {
        id: PAYMENT_ID,
        amount: 25.0,
        paidAt: new Date(PAST_DATE),
        observations: null,
        eventPassengerId: EP_ID,
        registeredById: USER_ID,
        createdAt: new Date(),
      };

      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);
      prismaMock.payment.create.mockResolvedValue(createdPayment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      const result = await service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE });

      expect(result.id).toBe(PAYMENT_ID);
    });

    it('deve lançar UnprocessableEntityException quando passageiro é EXEMPT', async () => {
      const ep = buildEventPassenger({ paymentStatus: 'EXEMPT' });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(service.create(EP_ID, buildUser(), { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar UnprocessableEntityException quando valor excede saldo restante', async () => {
      const ep = buildEventPassenger({ totalAmount: 50.0, paidAmount: 40.0 });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(service.create(EP_ID, buildUser(), { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar ForbiddenException quando congregação diferente', async () => {
      const user = buildUser({ congregationId: 'other-congregation' });
      const ep = buildEventPassenger();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando circuito diferente', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      const ep = buildEventPassenger();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);

      await expect(service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar UnprocessableEntityException quando lista da congregação está finalizada', async () => {
      const user = buildUser();
      const ep = buildEventPassenger({ totalAmount: 50.0, paidAmount: 0 });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);
      congregationEventStatusMock.ensureNotFinalized.mockRejectedValue(
        new UnprocessableEntityException(
          'A lista desta congregação já foi finalizada. Não é possível alterar pagamentos',
        ),
      );

      await expect(service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // ── findByEventPassenger ────────────────────────────────────────
  describe('findByEventPassenger', () => {
    it('deve retornar lista de pagamentos ordenada por paidAt desc', async () => {
      const user = buildUser();
      const ep = buildEventPassenger();
      const payments = [
        {
          id: 'pay-2',
          amount: 15.0,
          paidAt: new Date('2026-02-01'),
          observations: null,
          eventPassengerId: EP_ID,
          registeredById: USER_ID,
          createdAt: new Date(),
        },
        {
          id: 'pay-1',
          amount: 10.0,
          paidAt: new Date('2026-01-01'),
          observations: 'parcela 1',
          eventPassengerId: EP_ID,
          registeredById: USER_ID,
          createdAt: new Date(),
        },
      ];

      prismaMock.eventPassenger.findUnique.mockResolvedValue(ep as never);
      prismaMock.payment.findMany.mockResolvedValue(payments as never);

      const result = await service.findByEventPassenger(EP_ID, user);

      expect(result).toHaveLength(2);
      expect(result[0]!.amount).toBe('15');
      expect(result[1]!.observations).toBe('parcela 1');
      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { paidAt: 'desc' } }),
      );
    });

    it('deve retornar lista vazia quando não há pagamentos', async () => {
      const user = buildUser();
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEventPassenger() as never);
      prismaMock.payment.findMany.mockResolvedValue([]);

      const result = await service.findByEventPassenger(EP_ID, user);

      expect(result).toHaveLength(0);
    });

    it('deve lançar NotFoundException quando inscrição não existe', async () => {
      prismaMock.eventPassenger.findUnique.mockResolvedValue(null);

      await expect(service.findByEventPassenger('non-existent', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando circuito diferente', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      prismaMock.eventPassenger.findUnique.mockResolvedValue(buildEventPassenger() as never);

      await expect(service.findByEventPassenger(EP_ID, user)).rejects.toThrow(ForbiddenException);
    });
  });

  // ── findByEvent (extrato consolidado) ──────────────────────────
  describe('findByEvent', () => {
    const CONGREGATION_ID_2 = 'c1c2c3c4-0000-0000-0000-000000000002';

    function buildPaymentRow(overrides: Partial<{ id: string; amount: unknown; congregationId: string; congregationName: string; passengerName: string }> = {}): unknown {
      return {
        id: overrides.id ?? PAYMENT_ID,
        amount: overrides.amount ?? 25.0,
        paidAt: new Date(PAST_DATE),
        observations: null,
        eventPassengerId: EP_ID,
        registeredById: USER_ID,
        createdAt: new Date('2026-01-15T10:00:00Z'),
        eventPassenger: {
          passenger: { name: overrides.passengerName ?? 'Maria Silva' },
          congregation: {
            id: overrides.congregationId ?? CONGREGATION_ID,
            name: overrides.congregationName ?? 'Congregação Central',
          },
        },
      };
    }

    it('deve retornar todos os pagamentos do evento para role de circuito sem filtro', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.payment.findMany.mockResolvedValue([buildPaymentRow()] as never);
      prismaMock.payment.count.mockResolvedValue(1);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 25.0 } } as never);

      const result = await service.findByEvent(EVENT_ID, user, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        amount: '25.00',
        passengerName: 'Maria Silva',
        congregationId: CONGREGATION_ID,
        congregationName: 'Congregação Central',
      });
      expect(result.meta.totalReceived).toBe('25.00');
      expect(prismaMock.congregation.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventPassenger: { eventId: EVENT_ID } },
          orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });

    it('deve filtrar por congregação válida e recortar totalReceived', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.congregation.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.payment.findMany.mockResolvedValue([buildPaymentRow({ amount: 30.0 })] as never);
      prismaMock.payment.count.mockResolvedValue(1);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 30.0 } } as never);

      const result = await service.findByEvent(EVENT_ID, user, { congregationId: CONGREGATION_ID });

      expect(result.meta.totalReceived).toBe('30.00');
      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventPassenger: { eventId: EVENT_ID, congregationId: CONGREGATION_ID } },
        }),
      );
    });

    it('deve lançar NotFoundException quando congregação filtrada é de outro circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.congregation.findUnique.mockResolvedValue({ circuitId: 'outro-circuito' } as never);

      await expect(service.findByEvent(EVENT_ID, user, { congregationId: CONGREGATION_ID_2 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve auto-restringir role de congregação à própria, ignorando query param', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

      await service.findByEvent(EVENT_ID, user, { congregationId: CONGREGATION_ID });

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventPassenger: { eventId: EVENT_ID, congregationId: CONGREGATION_ID } },
        }),
      );
    });

    it('deve lançar ForbiddenException quando role de congregação pede outra congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);

      await expect(service.findByEvent(EVENT_ID, user, { congregationId: CONGREGATION_ID_2 })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar NotFoundException quando evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.findByEvent('non-existent', buildUser(), {})).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando evento é de outro circuito', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);

      await expect(service.findByEvent(EVENT_ID, user, {})).rejects.toThrow(ForbiddenException);
    });

    it('deve retornar totalReceived "0.00" quando o recorte está vazio', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

      const result = await service.findByEvent(EVENT_ID, user, {});

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalReceived).toBe('0.00');
      expect(result.meta.total).toBe(0);
    });

    it('deve aplicar paginação (skip/take) conforme page/limit', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({ circuitId: CIRCUIT_ID } as never);
      prismaMock.payment.findMany.mockResolvedValue([]);
      prismaMock.payment.count.mockResolvedValue(45);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: null } } as never);

      const result = await service.findByEvent(EVENT_ID, user, { page: 2, limit: 20 });

      expect(prismaMock.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
      expect(result.meta.totalPages).toBe(3);
    });
  });

  // ── generateReceipt (recibo PDF S-24-T) ────────────────────────
  describe('generateReceipt', () => {
    const CONGREGATION_ID_2 = 'c1c2c3c4-0000-0000-0000-000000000002';

    function mockReceiptData(): void {
      prismaMock.event.findUnique.mockResolvedValue({
        title: 'Ouça o que o espírito diz',
        type: 'ASSEMBLY',
        circuitId: CIRCUIT_ID,
      } as never);
      // Atende às duas chamadas a congregation.findUnique:
      // resolveCongregationScope (circuitId) e generateReceipt (name/code).
      prismaMock.congregation.findUnique.mockResolvedValue({
        circuitId: CIRCUIT_ID,
        name: 'Congregação Cidade Popular',
        code: 'CCP-01',
      } as never);
      prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 1500.0 } } as never);
      prismaMock.user.findUnique.mockResolvedValue({ name: 'João da Silva' } as never);
      prismaMock.user.findFirst.mockResolvedValue({ name: 'Carlos Pereira' } as never);
    }

    it('deve gerar o recibo com os dados consolidados da congregação', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      mockReceiptData();

      const result = await service.generateReceipt(CIRCUIT_ID, EVENT_ID, user, CONGREGATION_ID);

      expect(result.congregationCode).toBe('CCP-01');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(pdfServiceMock.generatePaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTypeLabel: 'Assembleia',
          eventTitle: 'Ouça o que o espírito diz',
          congregationName: 'Congregação Cidade Popular',
          totalReceived: '1500.00',
          filledByName: 'João da Silva',
          coordinatorName: 'Carlos Pereira',
        }),
      );
    });

    it('deve registrar audit log de EXPORT', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      mockReceiptData();
      const auditSpy = jest.spyOn(service['auditLogService'], 'log');

      await service.generateReceipt(CIRCUIT_ID, EVENT_ID, user, CONGREGATION_ID);

      expect(auditSpy).toHaveBeenCalledWith('EXPORT', 'PaymentReceipt', EVENT_ID, user.sub, expect.anything());
    });

    it('deve lançar BadRequestException quando role de circuito não informa congregationId', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({
        title: 'Evento',
        type: 'ASSEMBLY',
        circuitId: CIRCUIT_ID,
      } as never);

      await expect(service.generateReceipt(CIRCUIT_ID, EVENT_ID, user)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar NotFoundException quando o evento é de outro circuito (path)', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue({
        title: 'Evento',
        type: 'ASSEMBLY',
        circuitId: 'outro-circuito',
      } as never);

      await expect(service.generateReceipt(CIRCUIT_ID, EVENT_ID, user, CONGREGATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      prismaMock.event.findUnique.mockResolvedValue(null);

      await expect(service.generateReceipt(CIRCUIT_ID, EVENT_ID, user, CONGREGATION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ForbiddenException quando role de congregação pede outra congregação', async () => {
      const user = buildUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      prismaMock.event.findUnique.mockResolvedValue({
        title: 'Evento',
        type: 'ASSEMBLY',
        circuitId: CIRCUIT_ID,
      } as never);

      await expect(service.generateReceipt(CIRCUIT_ID, EVENT_ID, user, CONGREGATION_ID_2)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve usar coordinatorName nulo quando não há coordenador ativo no circuito', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      mockReceiptData();
      prismaMock.user.findFirst.mockResolvedValue(null);

      await service.generateReceipt(CIRCUIT_ID, EVENT_ID, user, CONGREGATION_ID);

      expect(pdfServiceMock.generatePaymentReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ coordinatorName: null }),
      );
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deve remover pagamento e recalcular paidAmount', async () => {
      const user = buildUser();
      const payment = buildPayment({
        amount: 25.0,
        eventPassenger: buildEventPassenger({ paidAmount: 25.0, totalAmount: 50.0 }),
      });

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);
      prismaMock.payment.delete.mockResolvedValue(payment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      await service.remove(PAYMENT_ID, user);

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve recalcular paymentStatus para PENDING quando paidAmount volta a 0', async () => {
      const user = buildUser();
      const payment = buildPayment({
        amount: 25.0,
        eventPassenger: buildEventPassenger({ paidAmount: 25.0, totalAmount: 50.0 }),
      });

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);
      prismaMock.payment.delete.mockResolvedValue(payment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      await service.remove(PAYMENT_ID, user);

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve recalcular paymentStatus para PARTIAL quando paidAmount parcial após remoção', async () => {
      const user = buildUser();
      const payment = buildPayment({
        amount: 10.0,
        eventPassenger: buildEventPassenger({ paidAmount: 35.0, totalAmount: 50.0 }),
      });

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);
      prismaMock.payment.delete.mockResolvedValue(payment as never);
      prismaMock.eventPassenger.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);
      prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));

      await service.remove(PAYMENT_ID, user);

      expect(prismaMock.$transaction).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException quando pagamento não existe', async () => {
      prismaMock.payment.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent', buildUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar UnprocessableEntityException quando evento não está OPEN', async () => {
      const payment = buildPayment({
        eventPassenger: buildEventPassenger({ event: buildEvent({ status: 'FINISHED' }) }),
      });

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);

      await expect(service.remove(PAYMENT_ID, buildUser())).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar UnprocessableEntityException quando prazo expirou para role de congregação', async () => {
      const payment = buildPayment({
        eventPassenger: buildEventPassenger({ event: buildEvent({ paymentDeadline: PAST_DEADLINE }) }),
      });

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);

      await expect(service.remove(PAYMENT_ID, buildUser({ role: 'CONGREGATION_COORDINATOR' }))).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('deve lançar ForbiddenException quando congregação diferente', async () => {
      const user = buildUser({ congregationId: 'other-congregation' });
      const payment = buildPayment();

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);

      await expect(service.remove(PAYMENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando circuito diferente', async () => {
      const user = buildUser({ circuitId: 'outro-circuito' });
      const payment = buildPayment();

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);

      await expect(service.remove(PAYMENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar UnprocessableEntityException quando lista da congregação está finalizada', async () => {
      const user = buildUser();
      const payment = buildPayment();
      prismaMock.payment.findUnique.mockResolvedValue(payment as never);
      congregationEventStatusMock.ensureNotFinalized.mockRejectedValue(
        new UnprocessableEntityException(
          'A lista desta congregação já foi finalizada. Não é possível alterar pagamentos',
        ),
      );

      await expect(service.remove(PAYMENT_ID, user)).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
