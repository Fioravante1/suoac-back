import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import type { CongregationDashboardResponse } from './interfaces/congregation-dashboard-response.interface';

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const CONGREGATION_ID = 'c1c2c3c4-0000-0000-0000-000000000001';

const MOCK_RESPONSE: CongregationDashboardResponse = {
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
      getCongregationDashboard: jest.fn(),
    } as unknown as jest.Mocked<DashboardService>;

    const module = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: serviceMock }],
    }).compile();

    controller = module.get(DashboardController);
  });

  describe('getCongregationDashboard', () => {
    it('deve delegar ao service e retornar o resultado', async () => {
      const user = buildUser();
      serviceMock.getCongregationDashboard.mockResolvedValue(MOCK_RESPONSE);

      const result = await controller.getCongregationDashboard(EVENT_ID, {}, user);

      expect(result).toBe(MOCK_RESPONSE);
      expect(serviceMock.getCongregationDashboard).toHaveBeenCalledWith(EVENT_ID, user, undefined);
    });

    it('deve repassar congregationId do query ao service', async () => {
      const user = buildUser({ role: 'CIRCUIT_COORDINATOR', congregationId: null });
      serviceMock.getCongregationDashboard.mockResolvedValue(MOCK_RESPONSE);

      await controller.getCongregationDashboard(EVENT_ID, { congregationId: CONGREGATION_ID }, user);

      expect(serviceMock.getCongregationDashboard).toHaveBeenCalledWith(EVENT_ID, user, CONGREGATION_ID);
    });

    it('deve propagar NotFoundException do service', async () => {
      const user = buildUser();
      serviceMock.getCongregationDashboard.mockRejectedValue(new NotFoundException('Evento não encontrado'));

      await expect(controller.getCongregationDashboard(EVENT_ID, {}, user)).rejects.toThrow(NotFoundException);
    });
  });
});
