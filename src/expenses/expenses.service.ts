import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { formatMoney } from '../common/money/money.util';
import type { Prisma } from '../generated/prisma/client';
import { EventStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import type { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import type { UpdateExpenseDto } from './dto/update-expense.dto';
import type { EventExpensesResponse, ExpenseResponse } from './interfaces/expense-response.interface';

/** Shape mínimo da despesa carregada do banco para mapeamento de resposta. */
interface ExpenseRecord {
  id: string;
  description: string;
  amount: unknown; // Decimal do Prisma
  category: ExpenseResponse['category'];
  incurredAt: Date;
  observations: string | null;
  eventId: string;
  registeredById: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(eventId: string, user: JwtPayload, dto: CreateExpenseDto): Promise<ExpenseResponse> {
    const event = await this.loadEvent(eventId);

    this.ensureCircuitRole(user);
    checkCircuitOwnership(user, event.circuitId);
    this.ensureExpenseAllowed(event.status, eventId);

    const incurredAt = new Date(dto.incurredAt);
    if (incurredAt > new Date()) {
      throw new UnprocessableEntityException('A data da despesa não pode ser futura');
    }

    const expense = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.expense.create({
        data: {
          description: dto.description,
          amount: dto.amount,
          category: dto.category,
          incurredAt,
          observations: dto.observations ?? null,
          eventId,
          registeredById: user.sub,
        },
      });

      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('CREATE', 'Expense', created.id, user.sub, {
          oldValues: null,
          newValues: created as unknown as Record<string, unknown>,
        }),
      });

      return created;
    });

    this.logger.log(`Despesa criada — id=${expense.id}, eventId=${eventId}, amount=${dto.amount}`);
    return this.toResponse(expense);
  }

  async findByEvent(eventId: string, user: JwtPayload, query: ListExpensesQueryDto): Promise<EventExpensesResponse> {
    const event = await this.loadEvent(eventId);

    this.ensureCircuitRole(user);
    checkCircuitOwnership(user, event.circuitId);

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('Intervalo inválido: "from" não pode ser posterior a "to"');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    this.logger.debug(
      `Listando despesas do evento — eventId=${eventId}, page=${page}, limit=${limit}, category=${query.category ?? 'todas'}`,
    );

    const where: Prisma.ExpenseWhereInput = {
      eventId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(from || to ? { incurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };

    const [expenses, total, aggregate] = await Promise.all([
      this.prisma.client.expense.findMany({
        where,
        orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.expense.count({ where }),
      this.prisma.client.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data: expenses.map((e) => this.toResponse(e)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalExpenses: formatMoney(aggregate._sum.amount),
      },
    };
  }

  async findOne(id: string, user: JwtPayload): Promise<ExpenseResponse> {
    const expense = await this.prisma.client.expense.findFirst({
      where: { id, deletedAt: null },
      include: { event: { select: { circuitId: true } } },
    });

    if (!expense) {
      this.logger.warn(`Despesa não encontrada — id=${id}`);
      throw new NotFoundException('Despesa não encontrada');
    }

    this.ensureCircuitRole(user);
    checkCircuitOwnership(user, expense.event.circuitId);

    return this.toResponse(expense);
  }

  async update(id: string, user: JwtPayload, dto: UpdateExpenseDto): Promise<ExpenseResponse> {
    const expense = await this.prisma.client.expense.findFirst({
      where: { id, deletedAt: null },
      include: { event: { select: { circuitId: true, status: true } } },
    });

    if (!expense) {
      this.logger.warn(`Despesa não encontrada — id=${id}`);
      throw new NotFoundException('Despesa não encontrada');
    }

    this.ensureCircuitRole(user);
    checkCircuitOwnership(user, expense.event.circuitId);
    this.ensureExpenseAllowed(expense.event.status, expense.eventId);

    const incurredAt = dto.incurredAt ? new Date(dto.incurredAt) : undefined;
    if (incurredAt && incurredAt > new Date()) {
      throw new UnprocessableEntityException('A data da despesa não pode ser futura');
    }

    const data: Prisma.ExpenseUpdateInput = {
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.amount !== undefined && { amount: dto.amount }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(incurredAt !== undefined && { incurredAt }),
      ...(dto.observations !== undefined && { observations: dto.observations }),
    };

    const updated = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.expense.update({ where: { id }, data });

      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('UPDATE', 'Expense', id, user.sub, {
          oldValues: expense as unknown as Record<string, unknown>,
          newValues: result as unknown as Record<string, unknown>,
        }),
      });

      return result;
    });

    this.logger.log(`Despesa atualizada — id=${id}, eventId=${expense.eventId}`);
    return this.toResponse(updated);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const expense = await this.prisma.client.expense.findFirst({
      where: { id, deletedAt: null },
      include: { event: { select: { circuitId: true, status: true } } },
    });

    if (!expense) {
      this.logger.warn(`Despesa não encontrada — id=${id}`);
      throw new NotFoundException('Despesa não encontrada');
    }

    this.ensureCircuitRole(user);
    checkCircuitOwnership(user, expense.event.circuitId);
    this.ensureExpenseAllowed(expense.event.status, expense.eventId);

    await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('DELETE', 'Expense', id, user.sub, {
          oldValues: expense as unknown as Record<string, unknown>,
          newValues: null,
        }),
      });
    });

    this.logger.warn(`Despesa removida (soft-delete) — id=${id}, eventId=${expense.eventId}`);
  }

  private async loadEvent(eventId: string): Promise<{ circuitId: string; status: EventStatus }> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { circuitId: true, status: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    return event;
  }

  /**
   * Despesa é recurso de circuito (contabilização do arranjo). Defesa explícita no
   * service além do @Roles do controller — guards não são a única barreira (AGENTS §7.7).
   */
  private ensureCircuitRole(user: JwtPayload): void {
    if (!isCircuitRole(user.role)) {
      throw new ForbiddenException('Apenas roles de circuito podem operar despesas');
    }
  }

  /**
   * Regras de status do evento para mutação de despesa:
   * - DRAFT/CANCELLED → 422 (evento não operacional / cancelado)
   * - OPEN/CLOSED → permitido
   * - FINISHED → permitido, mas registra warn (ajustes pós-evento são comuns no fechamento)
   */
  private ensureExpenseAllowed(status: EventStatus, eventId: string): void {
    if (status === EventStatus.DRAFT || status === EventStatus.CANCELLED) {
      throw new UnprocessableEntityException(
        'Não é possível operar despesas em eventos em rascunho ou cancelados',
      );
    }

    if (status === EventStatus.FINISHED) {
      this.logger.warn(`Operação de despesa em evento FINISHED — eventId=${eventId}`);
    }
  }

  private toResponse(expense: ExpenseRecord): ExpenseResponse {
    return {
      id: expense.id,
      description: expense.description,
      amount: formatMoney(expense.amount as Parameters<typeof formatMoney>[0]),
      category: expense.category,
      incurredAt: expense.incurredAt,
      observations: expense.observations,
      eventId: expense.eventId,
      registeredById: expense.registeredById,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
