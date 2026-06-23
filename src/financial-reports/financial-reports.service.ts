import { ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { addMoney, formatMoney, subtractMoney } from '../common/money/money.util';
import { EventStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CongregationRevenueRow,
  EventFinancialReportResponse,
  ExpenseCategoryBreakdown,
} from './interfaces/event-financial-report-response.interface';

/** Linha do groupBy de receitas (eventPassenger por congregação + status). */
interface RevenueGroup {
  congregationId: string;
  paymentStatus: PaymentStatus;
  _count: number;
  _sum: { totalAmount: unknown; paidAmount: unknown };
}

/** Linha do groupBy de despesas (por categoria). */
interface ExpenseGroup {
  category: ExpenseCategoryBreakdown['category'];
  _count: number;
  _sum: { amount: unknown };
}

@Injectable()
export class FinancialReportsService {
  private readonly logger = new Logger(FinancialReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Relatório financeiro consolidado do evento: receitas (Payments via EventPassenger)
   * + despesas (Expenses) + saldos. Rota sob `:circuitId` — valida que o evento pertence
   * ao circuito do path (`404` cross-circuit). Recurso de circuito (`403` p/ congregação).
   */
  async buildEventFinancialReport(
    circuitId: string,
    eventId: string,
    user: JwtPayload,
  ): Promise<EventFinancialReportResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, type: true, status: true, ticketPrice: true, circuitId: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    // Evento de outro circuito que não o do path → 404 (não revela existência cross-circuit)
    if (event.circuitId !== circuitId) {
      this.logger.warn(`Evento fora do circuito do path — eventId=${eventId}, circuitId=${circuitId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    this.ensureCircuitRole(user);
    checkCircuitOwnership(user, event.circuitId);

    if (event.status === EventStatus.DRAFT) {
      throw new UnprocessableEntityException('Relatório financeiro indisponível para eventos em rascunho');
    }

    this.logger.debug(`Gerando relatório financeiro — eventId=${eventId}`);

    const [revenueGroups, expenseGroups, requester] = await Promise.all([
      this.prisma.client.eventPassenger.groupBy({
        by: ['congregationId', 'paymentStatus'],
        where: { eventId },
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.client.expense.groupBy({
        by: ['category'],
        where: { eventId, deletedAt: null },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.client.user.findUnique({ where: { id: user.sub }, select: { name: true } }),
    ]);

    const byCongregation = await this.buildCongregationRows(revenueGroups);

    const totalExpected = addMoney(...byCongregation.map((r) => r.totalExpected));
    const totalReceived = addMoney(...byCongregation.map((r) => r.totalReceived));
    const totalPending = subtractMoney(totalExpected, totalReceived);

    const byCategory = this.buildExpenseBreakdown(expenseGroups);
    const expensesTotal = addMoney(...byCategory.map((c) => c.total));

    return {
      event: {
        id: event.id,
        title: event.title,
        type: event.type,
        status: event.status,
        ticketPrice: formatMoney(event.ticketPrice),
        circuitId: event.circuitId,
      },
      revenue: { totalExpected, totalReceived, totalPending, byCongregation },
      expenses: { total: expensesTotal, byCategory },
      cashBalance: subtractMoney(totalReceived, expensesTotal),
      projectedBalance: subtractMoney(totalExpected, expensesTotal),
      generatedAt: new Date(),
      generatedByName: requester?.name ?? 'Usuário desconhecido',
    };
  }

  /**
   * Consolida o groupBy (congregação × status) em uma linha por congregação. Passageiros
   * `EXEMPT` contam no total de passageiros mas NÃO entram em esperado/recebido.
   */
  private async buildCongregationRows(groups: RevenueGroup[]): Promise<CongregationRevenueRow[]> {
    if (groups.length === 0) {
      return [];
    }

    const congregationIds = [...new Set(groups.map((g) => g.congregationId))];
    const congregations = await this.prisma.client.congregation.findMany({
      where: { id: { in: congregationIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(congregations.map((c) => [c.id, c.name]));

    const rowMap = new Map<string, CongregationRevenueRow>();

    for (const group of groups) {
      let row = rowMap.get(group.congregationId);
      if (!row) {
        row = {
          congregationId: group.congregationId,
          congregationName: nameMap.get(group.congregationId) ?? '',
          totalPassengers: 0,
          totalExpected: '0.00',
          totalReceived: '0.00',
          totalPending: '0.00',
        };
        rowMap.set(group.congregationId, row);
      }

      row.totalPassengers += group._count;

      if (group.paymentStatus !== PaymentStatus.EXEMPT) {
        row.totalExpected = addMoney(row.totalExpected, group._sum.totalAmount as Parameters<typeof formatMoney>[0]);
        row.totalReceived = addMoney(row.totalReceived, group._sum.paidAmount as Parameters<typeof formatMoney>[0]);
        row.totalPending = subtractMoney(row.totalExpected, row.totalReceived);
      }
    }

    return [...rowMap.values()].sort((a, b) => a.congregationName.localeCompare(b.congregationName));
  }

  private buildExpenseBreakdown(groups: ExpenseGroup[]): ExpenseCategoryBreakdown[] {
    return groups
      .map((g) => ({
        category: g.category,
        total: formatMoney(g._sum.amount as Parameters<typeof formatMoney>[0]),
        count: g._count,
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  /**
   * Relatório de gastos é recurso de circuito — congregação não acessa o consolidado.
   * Defesa explícita no service além do @Roles do controller (AGENTS §7.7).
   */
  private ensureCircuitRole(user: JwtPayload): void {
    if (!isCircuitRole(user.role)) {
      throw new ForbiddenException('Apenas roles de circuito podem acessar o relatório financeiro');
    }
  }
}
