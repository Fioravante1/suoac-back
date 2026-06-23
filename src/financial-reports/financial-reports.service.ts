import { ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { addMoney, formatMoney, subtractMoney } from '../common/money/money.util';
import { PdfService } from '../common/pdf/pdf.service';
import type { FinancialReportPdfData } from '../common/pdf/interfaces/financial-report-pdf.interface';
import { EventStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CongregationRevenueRow,
  EventFinancialReportResponse,
  ExpenseCategoryBreakdown,
} from './interfaces/event-financial-report-response.interface';
import type { FinancialReportPdfResult } from './interfaces/financial-report-pdf-result.interface';

export type FinancialReportForm = 's26' | 's44';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
   * Gera o relatório financeiro oficial (S-26 Folha de Contas ou S-44 Relatório Mensal)
   * em PDF, preenchendo o formulário por nome. Reaproveita `buildEventFinancialReport`
   * para autorização + receitas/totais e busca as despesas individuais (linha a linha).
   * Audit log `EXPORT` (fire-and-forget).
   */
  async generateReport(
    circuitId: string,
    eventId: string,
    user: JwtPayload,
    form: FinancialReportForm,
  ): Promise<FinancialReportPdfResult> {
    const report = await this.buildEventFinancialReport(circuitId, eventId, user);

    const [event, expenses] = await Promise.all([
      this.prisma.client.event.findUnique({
        where: { id: eventId },
        select: { title: true, city: true, state: true, eventDays: { select: { date: true }, orderBy: { date: 'asc' } } },
      }),
      this.prisma.client.expense.findMany({
        where: { eventId, deletedAt: null },
        orderBy: { incurredAt: 'asc' },
        select: { description: true, incurredAt: true, amount: true },
      }),
    ]);

    if (!event) {
      throw new NotFoundException('Evento não encontrado');
    }

    const days = event.eventDays.map((d) => d.date);

    const data: FinancialReportPdfData = {
      eventTitle: event.title,
      city: event.city,
      state: event.state,
      eventDates: this.formatDateRange(days),
      monthYearLabel: days[0] ? this.formatMonthYear(days[0]) : '',
      revenueByCongregation: report.revenue.byCongregation.map((r) => ({
        congregationName: r.congregationName,
        received: r.totalReceived,
      })),
      expenses: expenses.map((e) => ({
        date: this.formatDayMonth(e.incurredAt),
        description: e.description,
        amount: formatMoney(e.amount),
      })),
      totalReceived: report.revenue.totalReceived,
      totalExpenses: report.expenses.total,
      balance: report.cashBalance,
    };

    const buffer =
      form === 's26' ? await this.pdfService.generateS26Report(data) : await this.pdfService.generateS44Report(data);

    this.logger.log(`Relatório financeiro ${form.toUpperCase()} gerado — eventId=${eventId}, circuitId=${circuitId}`);

    void this.auditLogService
      .log('EXPORT', 'FinancialReport', eventId, user.sub, {
        oldValues: null,
        newValues: {
          form,
          eventId,
          circuitId,
          totalReceived: data.totalReceived,
          totalExpenses: data.totalExpenses,
        },
      })
      .catch((err: unknown) => this.logger.error({ err }, 'Falha ao gravar audit log de relatório financeiro'));

    return { buffer, eventTitle: event.title };
  }

  /** Intervalo de datas do evento (date-only, UTC) — "dd/mm/aaaa" ou "dd/mm/aaaa a dd/mm/aaaa". */
  private formatDateRange(days: Date[]): string {
    const first = days[0];
    const last = days[days.length - 1];
    if (!first || !last) {
      return '—';
    }
    return first === last || days.length === 1
      ? this.formatFullDate(first)
      : `${this.formatFullDate(first)} a ${this.formatFullDate(last)}`;
  }

  /** "dd/mm/aaaa" para datas date-only (timezone UTC para não deslocar o dia). */
  private formatFullDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      date,
    );
  }

  /** "MM/AAAA" para o campo "Mês/Ano" do S-44 (date-only, UTC). */
  private formatMonthYear(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: '2-digit', year: 'numeric' }).format(date);
  }

  /** "dd/mm" para a coluna estreita de DATA do S-26 (incurredAt é DateTime → BRT). */
  private formatDayMonth(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(
      date,
    );
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
