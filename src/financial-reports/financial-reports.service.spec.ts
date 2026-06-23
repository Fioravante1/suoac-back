import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialReportsService } from './financial-reports.service';

// ── Constants ────────────────────────────────────────────────────
const CIRCUIT_ID = 'circuit-1';
const OTHER_CIRCUIT_ID = 'circuit-2';
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CONG_A = 'cong-a';
const CONG_B = 'cong-b';

// ── Helpers ──────────────────────────────────────────────────────
function buildCircuitUser(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: overrides.sub ?? USER_ID,
    email: overrides.email ?? 'coord@test.com',
    role: overrides.role ?? 'CIRCUIT_COORDINATOR',
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    congregationId: overrides.congregationId !== undefined ? overrides.congregationId : null,
  };
}

function buildEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EVENT_ID,
    title: 'Congresso 2026',
    type: 'REGIONAL_CONVENTION',
    status: 'FINISHED',
    ticketPrice: 40.0,
    circuitId: CIRCUIT_ID,
    ...overrides,
  };
}

describe('FinancialReportsService', () => {
  let service: FinancialReportsService;
  let prismaMock: DeepMockProxy<PrismaClientType>;

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();

    const module = await Test.createTestingModule({
      providers: [FinancialReportsService, { provide: PrismaService, useValue: { client: prismaMock } }],
    }).compile();

    service = module.get(FinancialReportsService);
  });

  function setupReport(options: {
    revenueGroups?: unknown[];
    expenseGroups?: unknown[];
    congregations?: Array<{ id: string; name: string }>;
    requesterName?: string | null;
    event?: Record<string, unknown>;
  }): void {
    prismaMock.event.findUnique.mockResolvedValue(buildEvent(options.event) as never);
    (prismaMock.eventPassenger.groupBy as unknown as jest.Mock).mockResolvedValue(options.revenueGroups ?? []);
    (prismaMock.expense.groupBy as unknown as jest.Mock).mockResolvedValue(options.expenseGroups ?? []);
    prismaMock.congregation.findMany.mockResolvedValue((options.congregations ?? []) as never);
    prismaMock.user.findUnique.mockResolvedValue(
      options.requesterName === null ? null : ({ name: options.requesterName ?? 'Coordenador' } as never),
    );
  }

  describe('buildEventFinancialReport', () => {
    it('deve consolidar receitas, despesas e os dois saldos', async () => {
      setupReport({
        revenueGroups: [
          { congregationId: CONG_A, paymentStatus: 'PAID', _count: 2, _sum: { totalAmount: 80, paidAmount: 80 } },
          { congregationId: CONG_A, paymentStatus: 'PARTIAL', _count: 1, _sum: { totalAmount: 40, paidAmount: 10 } },
          { congregationId: CONG_B, paymentStatus: 'PENDING', _count: 1, _sum: { totalAmount: 40, paidAmount: 0 } },
        ],
        expenseGroups: [
          { category: 'BUS_PAYMENT', _count: 1, _sum: { amount: 100 } },
          { category: 'OTHER', _count: 2, _sum: { amount: 20 } },
        ],
        congregations: [
          { id: CONG_A, name: 'Central' },
          { id: CONG_B, name: 'Norte' },
        ],
      });

      const result = await service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser());

      // Receita: expected 80+40+40=160, received 80+10+0=90, pending 70
      expect(result.revenue.totalExpected).toBe('160.00');
      expect(result.revenue.totalReceived).toBe('90.00');
      expect(result.revenue.totalPending).toBe('70.00');
      // Despesas: 100 + 20 = 120
      expect(result.expenses.total).toBe('120.00');
      // Saldos
      expect(result.cashBalance).toBe('-30.00'); // 90 - 120
      expect(result.projectedBalance).toBe('40.00'); // 160 - 120
      expect(result.event.ticketPrice).toBe('40.00');
      expect(result.generatedByName).toBe('Coordenador');
    });

    it('deve excluir passageiros EXEMPT de esperado/recebido mas contar no total de passageiros', async () => {
      setupReport({
        revenueGroups: [
          { congregationId: CONG_A, paymentStatus: 'PAID', _count: 1, _sum: { totalAmount: 40, paidAmount: 40 } },
          { congregationId: CONG_A, paymentStatus: 'EXEMPT', _count: 1, _sum: { totalAmount: 40, paidAmount: 0 } },
        ],
        congregations: [{ id: CONG_A, name: 'Central' }],
      });

      const result = await service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser());

      const row = result.revenue.byCongregation[0];
      expect(row?.totalPassengers).toBe(2);
      expect(row?.totalExpected).toBe('40.00');
      expect(row?.totalReceived).toBe('40.00');
    });

    it('deve ordenar congregações por nome', async () => {
      setupReport({
        revenueGroups: [
          { congregationId: CONG_B, paymentStatus: 'PAID', _count: 1, _sum: { totalAmount: 40, paidAmount: 40 } },
          { congregationId: CONG_A, paymentStatus: 'PAID', _count: 1, _sum: { totalAmount: 40, paidAmount: 40 } },
        ],
        congregations: [
          { id: CONG_A, name: 'Zulu' },
          { id: CONG_B, name: 'Alfa' },
        ],
      });

      const result = await service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser());

      expect(result.revenue.byCongregation.map((r) => r.congregationName)).toEqual(['Alfa', 'Zulu']);
    });

    it('deve retornar totais/saldos "0.00" quando não há dados', async () => {
      setupReport({});

      const result = await service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser());

      expect(result.revenue.totalExpected).toBe('0.00');
      expect(result.revenue.totalReceived).toBe('0.00');
      expect(result.expenses.total).toBe('0.00');
      expect(result.cashBalance).toBe('0.00');
      expect(result.projectedBalance).toBe('0.00');
      expect(result.revenue.byCongregation).toEqual([]);
      expect(result.expenses.byCategory).toEqual([]);
    });

    it('deve filtrar despesas não deletadas (deletedAt: null)', async () => {
      setupReport({});

      await service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser());

      expect(prismaMock.expense.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: EVENT_ID, deletedAt: null } }),
      );
    });

    it('deve usar "Usuário desconhecido" quando o requester não é encontrado', async () => {
      setupReport({ requesterName: null });

      const result = await service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser());

      expect(result.generatedByName).toBe('Usuário desconhecido');
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);
      await expect(service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar NotFoundException quando o evento pertence a outro circuito que não o do path', async () => {
      setupReport({ event: { circuitId: OTHER_CIRCUIT_ID } });
      await expect(service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar ForbiddenException para role de congregação', async () => {
      setupReport({});
      const user = buildCircuitUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONG_A });
      await expect(service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando o circuito do usuário diverge do evento/path (defesa no service)', async () => {
      // Evento pertence ao :circuitId do path, mas o JWT é de outro circuito → checkCircuitOwnership
      setupReport({});
      const user = buildCircuitUser({ circuitId: OTHER_CIRCUIT_ID });
      await expect(service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, user)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar UnprocessableEntityException quando o evento está em DRAFT', async () => {
      setupReport({ event: { status: 'DRAFT' } });
      await expect(service.buildEventFinancialReport(CIRCUIT_ID, EVENT_ID, buildCircuitUser())).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
