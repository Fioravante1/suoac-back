import { Test } from '@nestjs/testing';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import type { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import type { EventExpensesResponse, ExpenseResponse } from './interfaces/expense-response.interface';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

const USER: JwtPayload = {
  sub: 'u1u2u3u4-0000-0000-0000-000000000001',
  email: 'coord@test.com',
  role: 'CIRCUIT_COORDINATOR',
  circuitId: 'circuit-1',
  congregationId: null,
};

const EVENT_ID = 'e1e2e3e4-0000-0000-0000-000000000001';
const EXPENSE_ID = 'ex1ex2e3-0000-0000-0000-000000000001';

function buildExpenseResponse(overrides: Partial<ExpenseResponse> = {}): ExpenseResponse {
  return {
    id: overrides.id ?? EXPENSE_ID,
    description: overrides.description ?? 'Pagamento dos ônibus',
    amount: overrides.amount ?? '1500.00',
    category: overrides.category ?? 'BUS_PAYMENT',
    incurredAt: overrides.incurredAt ?? new Date('2026-01-15T10:00:00Z'),
    observations: overrides.observations ?? null,
    eventId: overrides.eventId ?? EVENT_ID,
    registeredById: overrides.registeredById ?? USER.sub,
    createdAt: overrides.createdAt ?? new Date('2026-01-15T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-15T10:00:00Z'),
  };
}

describe('ExpensesController', () => {
  let controller: ExpensesController;
  let serviceMock: jest.Mocked<ExpensesService>;

  beforeEach(async () => {
    serviceMock = {
      create: jest.fn(),
      findByEvent: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ExpensesService>;

    const module = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: serviceMock }],
    }).compile();

    controller = module.get(ExpensesController);
  });

  describe('create', () => {
    it('deve delegar a criação ao service e retornar o resultado', async () => {
      const expected = buildExpenseResponse();
      serviceMock.create.mockResolvedValue(expected);
      const dto: CreateExpenseDto = {
        description: 'Pagamento dos ônibus',
        amount: 1500,
        category: 'BUS_PAYMENT',
        incurredAt: '2026-01-15T10:00:00Z',
      };

      const result = await controller.create(EVENT_ID, USER, dto);

      expect(result).toEqual(expected);
      expect(serviceMock.create).toHaveBeenCalledWith(EVENT_ID, USER, dto);
    });
  });

  describe('findByEvent', () => {
    it('deve delegar a listagem repassando a query', async () => {
      const expected: EventExpensesResponse = {
        data: [buildExpenseResponse()],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, totalExpenses: '1500.00' },
      };
      serviceMock.findByEvent.mockResolvedValue(expected);
      const query = { category: 'BUS_PAYMENT' } as ListExpensesQueryDto;

      const result = await controller.findByEvent(EVENT_ID, USER, query);

      expect(result).toEqual(expected);
      expect(serviceMock.findByEvent).toHaveBeenCalledWith(EVENT_ID, USER, query);
    });
  });

  describe('findOne', () => {
    it('deve delegar a busca ao service', async () => {
      const expected = buildExpenseResponse();
      serviceMock.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(EXPENSE_ID, USER);

      expect(result).toEqual(expected);
      expect(serviceMock.findOne).toHaveBeenCalledWith(EXPENSE_ID, USER);
    });
  });

  describe('update', () => {
    it('deve delegar a atualização ao service', async () => {
      const expected = buildExpenseResponse({ description: 'Atualizado' });
      serviceMock.update.mockResolvedValue(expected);

      const result = await controller.update(EXPENSE_ID, USER, { description: 'Atualizado' });

      expect(result).toEqual(expected);
      expect(serviceMock.update).toHaveBeenCalledWith(EXPENSE_ID, USER, { description: 'Atualizado' });
    });
  });

  describe('remove', () => {
    it('deve delegar a remoção ao service e retornar void', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await expect(controller.remove(EXPENSE_ID, USER)).resolves.toBeUndefined();
      expect(serviceMock.remove).toHaveBeenCalledWith(EXPENSE_ID, USER);
    });
  });
});
