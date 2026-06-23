import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { PrismaClient as PrismaClientType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import type { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { ExpensesService } from './expenses.service';

// ── Types ────────────────────────────────────────────────────────
interface PrismaEvent {
  circuitId: string;
  status: string;
}

interface PrismaExpense {
  id: string;
  description: string;
  amount: unknown;
  category: string;
  incurredAt: Date;
  observations: string | null;
  eventId: string;
  registeredById: string;
  createdAt: Date;
  updatedAt: Date;
  event?: PrismaEvent;
}

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const EXPENSE_ID = 'ex1ex2e3-0000-0000-0000-000000000001';
const USER_ID = 'u1u2u3u4-0000-0000-0000-000000000001';
const CIRCUIT_ID = 'circuit-1';
const OTHER_CIRCUIT_ID = 'circuit-2';
const CONGREGATION_ID = 'cong-1';

const PAST_DATE = '2026-01-15T10:00:00Z';
const FUTURE_DATE = '2099-12-31T23:59:59Z';

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

function buildEvent(overrides: Partial<PrismaEvent> = {}): PrismaEvent {
  return {
    circuitId: overrides.circuitId ?? CIRCUIT_ID,
    status: overrides.status ?? 'OPEN',
  };
}

function buildExpense(overrides: Partial<PrismaExpense> = {}): PrismaExpense {
  return {
    id: overrides.id ?? EXPENSE_ID,
    description: overrides.description ?? 'Pagamento dos ônibus',
    amount: overrides.amount ?? 1500.0,
    category: overrides.category ?? 'BUS_PAYMENT',
    incurredAt: overrides.incurredAt ?? new Date(PAST_DATE),
    observations: overrides.observations ?? null,
    eventId: overrides.eventId ?? EVENT_ID,
    registeredById: overrides.registeredById ?? USER_ID,
    createdAt: overrides.createdAt ?? new Date(PAST_DATE),
    updatedAt: overrides.updatedAt ?? new Date(PAST_DATE),
    ...(overrides.event !== undefined ? { event: overrides.event } : {}),
  };
}

function buildCreateDto(overrides: Partial<CreateExpenseDto> = {}): CreateExpenseDto {
  return {
    description: overrides.description ?? 'Pagamento dos ônibus',
    amount: overrides.amount ?? 1500.0,
    category: overrides.category ?? 'BUS_PAYMENT',
    incurredAt: overrides.incurredAt ?? PAST_DATE,
    observations: overrides.observations,
  };
}

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prismaMock: DeepMockProxy<PrismaClientType>;
  let auditLogMock: { log: jest.Mock; buildCreateData: jest.Mock };

  beforeEach(async () => {
    prismaMock = mockDeep<PrismaClientType>();
    auditLogMock = {
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
    };

    const module = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: { client: prismaMock } },
        { provide: AuditLogService, useValue: auditLogMock },
      ],
    }).compile();

    service = module.get(ExpensesService);
    prismaMock.$transaction.mockImplementation((fn: (tx: PrismaClientType) => Promise<unknown>) => fn(prismaMock));
  });

  describe('create', () => {
    it('deve criar uma despesa com dados válidos e registrar audit log na transação', async () => {
      const created = buildExpense();
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.expense.create.mockResolvedValue(created as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      const result = await service.create(EVENT_ID, buildCircuitUser(), buildCreateDto());

      expect(result).toMatchObject({ id: EXPENSE_ID, amount: '1500.00', category: 'BUS_PAYMENT', eventId: EVENT_ID });
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(prismaMock.auditLog.create).toHaveBeenCalled();
      expect(auditLogMock.buildCreateData).toHaveBeenCalledWith(
        'CREATE',
        'Expense',
        EXPENSE_ID,
        USER_ID,
        expect.anything(),
      );
    });

    it('deve lançar NotFoundException quando o evento não existe', async () => {
      prismaMock.event.findUnique.mockResolvedValue(null);
      await expect(service.create(EVENT_ID, buildCircuitUser(), buildCreateDto())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException para role de congregação (defesa no service)', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      const user = buildCircuitUser({ role: 'CONGREGATION_COORDINATOR', congregationId: CONGREGATION_ID });
      await expect(service.create(EVENT_ID, user, buildCreateDto())).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando o evento é de outro circuito', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ circuitId: OTHER_CIRCUIT_ID }) as never);
      await expect(service.create(EVENT_ID, buildCircuitUser(), buildCreateDto())).rejects.toThrow(ForbiddenException);
    });

    it.each(['DRAFT', 'CANCELLED'])(
      'deve lançar UnprocessableEntityException quando o evento está %s',
      async (status) => {
        prismaMock.event.findUnique.mockResolvedValue(buildEvent({ status }) as never);
        await expect(service.create(EVENT_ID, buildCircuitUser(), buildCreateDto())).rejects.toThrow(
          UnprocessableEntityException,
        );
      },
    );

    it('deve permitir criar em evento FINISHED registrando warn', async () => {
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ status: 'FINISHED' }) as never);
      prismaMock.expense.create.mockResolvedValue(buildExpense() as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.create(EVENT_ID, buildCircuitUser(), buildCreateDto());

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('FINISHED'));
    });

    it('deve lançar UnprocessableEntityException quando incurredAt é futura', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      await expect(
        service.create(EVENT_ID, buildCircuitUser(), buildCreateDto({ incurredAt: FUTURE_DATE })),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('findByEvent', () => {
    function setupList(expenses: PrismaExpense[], total: number, sum: unknown): void {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      prismaMock.expense.findMany.mockResolvedValue(expenses as never);
      prismaMock.expense.count.mockResolvedValue(total);
      prismaMock.expense.aggregate.mockResolvedValue({ _sum: { amount: sum } } as never);
    }

    it('deve listar despesas paginadas com totalExpenses agregado', async () => {
      setupList([buildExpense()], 1, 1500.0);

      const result = await service.findByEvent(EVENT_ID, buildCircuitUser(), {});

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1, totalExpenses: '1500.00' });
    });

    it('deve retornar totalExpenses "0.00" quando o recorte é vazio', async () => {
      setupList([], 0, null);

      const result = await service.findByEvent(EVENT_ID, buildCircuitUser(), {});

      expect(result.meta.totalExpenses).toBe('0.00');
    });

    it('deve filtrar apenas despesas não deletadas (deletedAt: null)', async () => {
      setupList([buildExpense()], 1, 1500.0);

      await service.findByEvent(EVENT_ID, buildCircuitUser(), {});

      expect(prismaMock.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ eventId: EVENT_ID, deletedAt: null }) }),
      );
    });

    it('deve lançar BadRequestException quando from > to', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      const query = { from: '2026-06-10T00:00:00Z', to: '2026-06-01T00:00:00Z' } as ListExpensesQueryDto;
      await expect(service.findByEvent(EVENT_ID, buildCircuitUser(), query)).rejects.toThrow(BadRequestException);
    });

    it('deve lançar ForbiddenException para role de congregação', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent() as never);
      const user = buildCircuitUser({ role: 'CONGREGATION_ASSISTANT', congregationId: CONGREGATION_ID });
      await expect(service.findByEvent(EVENT_ID, user, {})).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ForbiddenException quando o evento é de outro circuito', async () => {
      prismaMock.event.findUnique.mockResolvedValue(buildEvent({ circuitId: OTHER_CIRCUIT_ID }) as never);
      await expect(service.findByEvent(EVENT_ID, buildCircuitUser(), {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findOne', () => {
    it('deve retornar a despesa quando existe e pertence ao circuito', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(buildExpense({ event: buildEvent() }) as never);

      const result = await service.findOne(EXPENSE_ID, buildCircuitUser());

      expect(result.id).toBe(EXPENSE_ID);
    });

    it('deve lançar NotFoundException quando a despesa não existe ou está deletada', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(null);
      await expect(service.findOne(EXPENSE_ID, buildCircuitUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando a despesa é de outro circuito', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(
        buildExpense({ event: buildEvent({ circuitId: OTHER_CIRCUIT_ID }) }) as never,
      );
      await expect(service.findOne(EXPENSE_ID, buildCircuitUser())).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('deve atualizar a despesa e registrar audit log UPDATE na transação', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(buildExpense({ event: buildEvent() }) as never);
      prismaMock.expense.update.mockResolvedValue(buildExpense({ description: 'Atualizado' }) as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      const result = await service.update(EXPENSE_ID, buildCircuitUser(), { description: 'Atualizado' });

      expect(result.description).toBe('Atualizado');
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(auditLogMock.buildCreateData).toHaveBeenCalledWith(
        'UPDATE',
        'Expense',
        EXPENSE_ID,
        USER_ID,
        expect.anything(),
      );
    });

    it('deve lançar NotFoundException quando a despesa não existe', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(null);
      await expect(service.update(EXPENSE_ID, buildCircuitUser(), { description: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve lançar UnprocessableEntityException quando incurredAt é futura', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(buildExpense({ event: buildEvent() }) as never);
      await expect(
        service.update(EXPENSE_ID, buildCircuitUser(), { incurredAt: FUTURE_DATE }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('deve lançar UnprocessableEntityException quando o evento está CANCELLED', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(
        buildExpense({ event: buildEvent({ status: 'CANCELLED' }) }) as never,
      );
      await expect(service.update(EXPENSE_ID, buildCircuitUser(), { description: 'x' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('remove', () => {
    it('deve marcar deletedAt (soft-delete) e registrar audit log DELETE na transação', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(buildExpense({ event: buildEvent() }) as never);
      prismaMock.expense.update.mockResolvedValue({} as never);
      prismaMock.auditLog.create.mockResolvedValue({} as never);

      await service.remove(EXPENSE_ID, buildCircuitUser());

      expect(prismaMock.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EXPENSE_ID }, data: { deletedAt: expect.any(Date) } }),
      );
      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(auditLogMock.buildCreateData).toHaveBeenCalledWith(
        'DELETE',
        'Expense',
        EXPENSE_ID,
        USER_ID,
        expect.anything(),
      );
    });

    it('deve lançar NotFoundException quando a despesa não existe ou já está deletada', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(null);
      await expect(service.remove(EXPENSE_ID, buildCircuitUser())).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException quando a despesa é de outro circuito', async () => {
      prismaMock.expense.findFirst.mockResolvedValue(
        buildExpense({ event: buildEvent({ circuitId: OTHER_CIRCUIT_ID }) }) as never,
      );
      await expect(service.remove(EXPENSE_ID, buildCircuitUser())).rejects.toThrow(ForbiddenException);
    });
  });
});
