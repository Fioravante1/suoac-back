import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// ── Types ────────────────────────────────────────────────────────
interface PrismaEvent {
  id: string;
  status: string;
  paymentDeadline: Date;
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

const FUTURE_DEADLINE = new Date('2099-12-31T23:59:59Z');
const PAST_DEADLINE = new Date('2020-01-01T00:00:00Z');
const PAST_DATE = '2026-01-15T10:00:00Z';

// ── Helpers ──────────────────────────────────────────────────────
function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'user@test.com',
    role: overrides.role ?? 'CONGREGATION_COORDINATOR',
    circuitId: overrides.circuitId ?? 'circuit-1',
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : CONGREGATION_ID,
  };
}

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    id: overrides.id ?? EVENT_ID,
    status: overrides.status ?? 'OPEN',
    paymentDeadline: overrides.paymentDeadline ?? FUTURE_DEADLINE,
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

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [PaymentsService, { provide: PrismaService, useValue: { client: prismaMock } }],
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
      prismaMock.$transaction.mockResolvedValue([createdPayment, {}]);

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
      prismaMock.$transaction.mockResolvedValue([createdPayment, {}]);

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
      prismaMock.$transaction.mockResolvedValue([createdPayment, {}]);

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
      prismaMock.$transaction.mockResolvedValue([createdPayment, {}]);

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

      await expect(service.create(EP_ID, user, { amount: 25, paidAt: PAST_DATE })).rejects.toThrow(
        ForbiddenException,
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
      prismaMock.$transaction.mockResolvedValue([{}, {}]);

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
      prismaMock.$transaction.mockResolvedValue([{}, {}]);

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
      prismaMock.$transaction.mockResolvedValue([{}, {}]);

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

      await expect(
        service.remove(PAYMENT_ID, buildUser({ role: 'CONGREGATION_COORDINATOR' })),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar ForbiddenException quando congregação diferente', async () => {
      const user = buildUser({ congregationId: 'other-congregation' });
      const payment = buildPayment();

      prismaMock.payment.findUnique.mockResolvedValue(payment as never);

      await expect(service.remove(PAYMENT_ID, user)).rejects.toThrow(ForbiddenException);
    });
  });
});
