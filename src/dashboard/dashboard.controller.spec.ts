import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import type { DashboardResponse } from './interfaces/congregation-dashboard-response.interface';
import type { FinancialSummaryResponse } from './interfaces/financial-summary-response.interface';

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';

const MOCK_RESPONSE: DashboardResponse = {
  event: {
    id: EVENT_ID,
    title: 'Assembleia de Circuito',
    type: 'ASSEMBLY',
    status: 'OPEN',
    ticketPrice: '25.00',
    registrationDeadline: new Date('2099-12-31T23:59:59Z'),
    paymentDeadline: new Date('2099-12-31T23:59:59Z'),
    venue: 'Salão',
    address: 'Rua A',
    city: 'São Paulo',
    state: 'SP',
    days: [],
  },
  congregation: {
    id: CONGREGATION_ID,
    name: 'Congregação Central',
    listStatus: 'PENDING',
  },
  stats: {
    totalPassengers: 10,
    totalExpected: '250.00',
    totalReceived: '100.00',
    totalPending: '150.00',
  },
  paymentBreakdown: { paid: 3, partial: 2, pending: 4, exempt: 1 },
  pendingPassengers: [],
  totalPendingPassengers: 6,
  passengersByDay: [],
};

const MOCK_FINANCIAL_RESPONSE: FinancialSummaryResponse = {
  eventId: EVENT_ID,
  eventTitle: 'Assembleia de Circuito',
  ticketPrice: '25.00',
  totals: {
    totalPassengers: 30,
    totalExpected: '750.00',
    totalReceived: '500.00',
    totalPending: '250.00',
    byStatus: { paid: 15, partial: 5, pending: 8, exempt: 2 },
  },
  congregations: [],
};

function buildUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? 'u1u2u3u4-0000-0000-0000-000000000001',
    email: overrides.email ?? 'user@test.com',
    role: overrides.role ?? 'CONGREGATION_COORDINATOR',
    circuitId: overrides.circuitId ?? 'circuit-1',
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : CONGREGATION_ID,
  };
}

// ── Test Suite ───────────────────────────────────────────────────
describe('DashboardController', () => {
  let controller: DashboardController;
  let serviceMock: jest.Mocked<DashboardService>;

  beforeEach(async () => {
    serviceMock = {
      getDashboard: jest.fn(),
      getFinancialSummary: jest.fn(),
      exportFinancialSummary: jest.fn(),
      buildPaymentBreakdown: jest.fn(),
    } as unknown as jest.Mocked<DashboardService>;

    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: serviceMock }],
    }).compile();

    controller = module.get(DashboardController);
  });

  describe('getDashboard', () => {
    it('deve delegar ao service e retornar o resultado', async () => {
      const user = buildUser();
      serviceMock.getDashboard.mockResolvedValue(MOCK_RESPONSE);

      const result = await controller.getDashboard(EVENT_ID, {}, user);

      expect(result).toBe(MOCK_RESPONSE);
      expect(serviceMock.getDashboard).toHaveBeenCalledWith(EVENT_ID, user, undefined);
    });

    it('deve repassar congregationId do query ao service', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      serviceMock.getDashboard.mockResolvedValue(MOCK_RESPONSE);

      await controller.getDashboard(EVENT_ID, { congregationId: CONGREGATION_ID }, user);

      expect(serviceMock.getDashboard).toHaveBeenCalledWith(EVENT_ID, user, CONGREGATION_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      const user = buildUser();
      serviceMock.getDashboard.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.getDashboard(EVENT_ID, {}, user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFinancialSummary', () => {
    it('deve delegar ao service e retornar o resultado', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      serviceMock.getFinancialSummary.mockResolvedValue(MOCK_FINANCIAL_RESPONSE);

      const result = await controller.getFinancialSummary(EVENT_ID, user);

      expect(result).toBe(MOCK_FINANCIAL_RESPONSE);
      expect(serviceMock.getFinancialSummary).toHaveBeenCalledWith(EVENT_ID, user);
    });

    it('deve propagar NotFoundException do service', async () => {
      const user = buildUser();
      serviceMock.getFinancialSummary.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.getFinancialSummary(EVENT_ID, user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportFinancialSummary', () => {
    function buildReply(): FastifyReply {
      const reply = { header: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
      return reply as unknown as FastifyReply;
    }

    it('deve enviar o arquivo com Content-Type/Disposition e default format=pdf', async () => {
      const buffer = Buffer.from('%PDF-1.7');
      serviceMock.exportFinancialSummary.mockResolvedValue({
        buffer,
        filename: 'resumo-financeiro-event-1.pdf',
        contentType: 'application/pdf',
      });
      const reply = buildReply();

      await controller.exportFinancialSummary('circuit-1', 'event-1', {}, buildUser(), reply);

      expect(serviceMock.exportFinancialSummary).toHaveBeenCalledWith('circuit-1', 'event-1', expect.anything(), 'pdf');
      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="resumo-financeiro-event-1.pdf"',
      );
      expect(reply.send).toHaveBeenCalledWith(buffer);
    });

    it('deve repassar o format=xlsx do query ao service', async () => {
      serviceMock.exportFinancialSummary.mockResolvedValue({
        buffer: Buffer.from('PK\x03\x04'),
        filename: 'resumo-financeiro-event-1.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await controller.exportFinancialSummary('circuit-1', 'event-1', { format: 'xlsx' }, buildUser(), buildReply());

      expect(serviceMock.exportFinancialSummary).toHaveBeenCalledWith('circuit-1', 'event-1', expect.anything(), 'xlsx');
    });

    it('deve propagar NotFoundException do service', async () => {
      serviceMock.exportFinancialSummary.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(
        controller.exportFinancialSummary('circuit-1', 'event-1', {}, buildUser(), buildReply()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
