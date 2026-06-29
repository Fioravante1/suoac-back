import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { addMoney, formatMoney, subtractMoney } from '../common/money/money.util';
import type { Prisma } from '../generated/prisma/client';
import { CongregationListStatus, EventStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DashboardDayCount,
  DashboardPaymentBreakdown,
  DashboardPendingPassenger,
  DashboardResponse,
  DashboardStats,
} from './interfaces/congregation-dashboard-response.interface';
import type {
  CongregationFinancialRow,
  FinancialSummaryResponse,
} from './interfaces/financial-summary-response.interface';

interface BreakdownEntry {
  paymentStatus: string;
  _count: number;
  _sum: { totalAmount: Prisma.Decimal | null; paidAmount: Prisma.Decimal | null };
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(eventId: string, user: JwtPayload, congregationId?: string): Promise<DashboardResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: { eventDays: { orderBy: { dayNumber: 'asc' } } },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    if (!isCircuitRole(user.role) && event.status === EventStatus.DRAFT) {
      this.logger.warn(`Acesso negado: Evento em DRAFT — id=${eventId}, role=${user.role}`);
      throw new NotFoundException('Evento não encontrado');
    }

    const resolvedCongregationId = this.resolveCongregationId(user, congregationId);

    if (resolvedCongregationId) {
      return this.buildCongregationDashboard(event, resolvedCongregationId, eventId);
    }

    return this.buildCircuitDashboard(event, eventId);
  }

  async getFinancialSummary(eventId: string, user: JwtPayload): Promise<FinancialSummaryResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    if (!isCircuitRole(user.role) && event.status === EventStatus.DRAFT) {
      this.logger.warn(`Acesso negado: Evento em DRAFT — id=${eventId}, role=${user.role}`);
      throw new NotFoundException('Evento não encontrado');
    }

    const congregationFilter = this.resolveCongregationFilter(user);
    const baseWhere = { eventId, ...congregationFilter };

    const [breakdown, congregationRows] = await Promise.all([
      this.prisma.client.eventPassenger.groupBy({
        by: ['paymentStatus'],
        where: baseWhere,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.buildCongregationRows(eventId, congregationFilter),
    ]);

    const totals = this.computeFinancialTotals(breakdown);

    this.logger.debug(`Financial summary carregado — eventId=${eventId}, passengers=${totals.totalPassengers}`);

    return {
      eventId: event.id,
      eventTitle: event.title,
      ticketPrice: String(event.ticketPrice),
      totals: {
        totalPassengers: totals.totalPassengers,
        totalExpected: totals.totalExpected,
        totalReceived: totals.totalReceived,
        totalPending: totals.totalPending,
        byStatus: this.buildPaymentBreakdown(breakdown),
      },
      congregations: congregationRows,
    };
  }

  private async buildCongregationRows(
    eventId: string,
    congregationFilter: { congregationId?: string },
  ): Promise<CongregationFinancialRow[]> {
    const passengersByCongreation = await this.prisma.client.eventPassenger.groupBy({
      by: ['congregationId', 'paymentStatus'],
      where: { eventId, ...congregationFilter },
      _count: true,
      _sum: { totalAmount: true, paidAmount: true },
    });

    if (passengersByCongreation.length === 0) {
      return [];
    }

    const congregationIds = [...new Set(passengersByCongreation.map((r) => r.congregationId))];

    const congregations = await this.prisma.client.congregation.findMany({
      where: { id: { in: congregationIds } },
      select: { id: true, name: true },
    });

    const nameMap = new Map(congregations.map((c) => [c.id, c.name]));

    const rowMap = new Map<string, CongregationFinancialRow>();

    for (const entry of passengersByCongreation) {
      let row = rowMap.get(entry.congregationId);

      if (!row) {
        row = {
          congregationId: entry.congregationId,
          congregationName: nameMap.get(entry.congregationId) ?? '',
          totalPassengers: 0,
          totalExpected: '0.00',
          totalReceived: '0.00',
          totalPending: '0.00',
          byStatus: { paid: 0, partial: 0, pending: 0, exempt: 0 },
        };
        rowMap.set(entry.congregationId, row);
      }

      row.totalPassengers += entry._count;

      if (entry.paymentStatus !== PaymentStatus.EXEMPT) {
        row.totalExpected = addMoney(row.totalExpected, entry._sum.totalAmount);
        row.totalReceived = addMoney(row.totalReceived, entry._sum.paidAmount);
        row.totalPending = subtractMoney(row.totalExpected, row.totalReceived);
      }

      const statusToKey: Record<string, keyof CongregationFinancialRow['byStatus']> = {
        [PaymentStatus.PAID]: 'paid',
        [PaymentStatus.PARTIAL]: 'partial',
        [PaymentStatus.PENDING]: 'pending',
        [PaymentStatus.EXEMPT]: 'exempt',
      };

      const key = statusToKey[entry.paymentStatus];
      if (key) {
        row.byStatus[key] = entry._count;
      }
    }

    return [...rowMap.values()].sort((a, b) => a.congregationName.localeCompare(b.congregationName));
  }

  private async buildCongregationDashboard(
    event: {
      id: string;
      title: string;
      type: string;
      status: string;
      ticketPrice: unknown;
      registrationDeadline: Date;
      paymentDeadline: Date;
      venue: string;
      address: string;
      city: string;
      state: string;
      circuitId: string;
      eventDays: Array<{ id: string; date: Date; label: string; dayNumber: number; status: string }>;
    },
    congregationId: string,
    eventId: string,
  ): Promise<DashboardResponse> {
    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: congregationId, circuitId: event.circuitId, isActive: true },
    });

    if (!congregation) {
      this.logger.warn(`Congregação não encontrada — id=${congregationId}`);
      throw new NotFoundException('Congregação não encontrada');
    }

    const where = { eventId, congregationId };

    const [breakdown, status, pendingPassengers, totalPendingPassengers, passengersByDay] = await Promise.all([
      this.prisma.client.eventPassenger.groupBy({
        by: ['paymentStatus'],
        where,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.client.congregationEventStatus.findUnique({
        where: { congregationId_eventId: { congregationId, eventId } },
      }),
      this.prisma.client.eventPassenger.findMany({
        where: {
          ...where,
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        },
        include: { passenger: { select: { name: true } } },
        orderBy: { passenger: { name: 'asc' } },
        take: 5,
      }),
      this.prisma.client.eventPassenger.count({
        where: {
          ...where,
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        },
      }),
      this.buildPassengersByDay(eventId, event.eventDays, congregationId),
    ]);

    const totals = this.computeFinancialTotals(breakdown);

    this.logger.debug(
      `Dashboard (congregação) carregado — eventId=${eventId}, congregationId=${congregationId}, passengers=${totals.totalPassengers}`,
    );

    return {
      event: this.buildEventInfo(event),
      congregation: {
        id: congregation.id,
        name: congregation.name,
        listStatus: status?.status ?? CongregationListStatus.PENDING,
      },
      stats: this.toStatsResponse(totals),
      paymentBreakdown: this.buildPaymentBreakdown(breakdown),
      pendingPassengers: pendingPassengers.map((ep) => this.toPendingPassengerResponse(ep)),
      totalPendingPassengers,
      passengersByDay,
    };
  }

  private async buildCircuitDashboard(
    event: {
      id: string;
      title: string;
      type: string;
      status: string;
      ticketPrice: unknown;
      registrationDeadline: Date;
      paymentDeadline: Date;
      venue: string;
      address: string;
      city: string;
      state: string;
      circuitId: string;
      eventDays: Array<{ id: string; date: Date; label: string; dayNumber: number; status: string }>;
    },
    eventId: string,
  ): Promise<DashboardResponse> {
    const where = { eventId };

    const [breakdown, pendingPassengers, totalPendingPassengers, passengersByDay] = await Promise.all([
      this.prisma.client.eventPassenger.groupBy({
        by: ['paymentStatus'],
        where,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.client.eventPassenger.findMany({
        where: {
          ...where,
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        },
        include: { passenger: { select: { name: true } } },
        orderBy: { passenger: { name: 'asc' } },
        take: 5,
      }),
      this.prisma.client.eventPassenger.count({
        where: {
          ...where,
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
        },
      }),
      this.buildPassengersByDay(eventId, event.eventDays),
    ]);

    const totals = this.computeFinancialTotals(breakdown);

    this.logger.debug(`Dashboard (circuito) carregado — eventId=${eventId}, passengers=${totals.totalPassengers}`);

    return {
      event: this.buildEventInfo(event),
      congregation: null,
      stats: this.toStatsResponse(totals),
      paymentBreakdown: this.buildPaymentBreakdown(breakdown),
      pendingPassengers: pendingPassengers.map((ep) => this.toPendingPassengerResponse(ep)),
      totalPendingPassengers,
      passengersByDay,
    };
  }

  private resolveCongregationId(user: JwtPayload, congregationId?: string): string | null {
    if (isCircuitRole(user.role)) {
      return congregationId ?? null;
    }

    if (!user.congregationId) {
      throw new ForbiddenException('Usuário de congregação sem congregação vinculada');
    }

    return user.congregationId;
  }

  private resolveCongregationFilter(user: JwtPayload): { congregationId?: string } {
    if (isCircuitRole(user.role)) {
      return {};
    }

    if (!user.congregationId) {
      throw new ForbiddenException('Usuário de congregação sem congregação vinculada');
    }

    return { congregationId: user.congregationId };
  }

  private computeFinancialTotals(breakdown: BreakdownEntry[]): {
    totalPassengers: number;
    totalExpected: string;
    totalReceived: string;
    totalPending: string;
  } {
    const billable = breakdown.filter((e) => e.paymentStatus !== PaymentStatus.EXEMPT);
    const totalPassengers = breakdown.reduce((sum, e) => sum + e._count, 0);
    const totalExpected = addMoney(...billable.map((e) => e._sum.totalAmount));
    const totalReceived = addMoney(...billable.map((e) => e._sum.paidAmount));

    return { totalPassengers, totalExpected, totalReceived, totalPending: subtractMoney(totalExpected, totalReceived) };
  }

  private toStatsResponse(totals: {
    totalPassengers: number;
    totalExpected: string;
    totalReceived: string;
    totalPending: string;
  }): DashboardStats {
    return {
      totalPassengers: totals.totalPassengers,
      totalExpected: totals.totalExpected,
      totalReceived: totals.totalReceived,
      totalPending: totals.totalPending,
    };
  }

  private buildEventInfo(event: {
    id: string;
    title: string;
    type: string;
    status: string;
    ticketPrice: unknown;
    registrationDeadline: Date;
    paymentDeadline: Date;
    venue: string;
    address: string;
    city: string;
    state: string;
    eventDays: Array<{ id: string; date: Date; label: string; dayNumber: number; status: string }>;
  }): DashboardResponse['event'] {
    return {
      id: event.id,
      title: event.title,
      type: event.type,
      status: event.status,
      ticketPrice: String(event.ticketPrice),
      registrationDeadline: event.registrationDeadline,
      paymentDeadline: event.paymentDeadline,
      venue: event.venue,
      address: event.address,
      city: event.city,
      state: event.state,
      days: event.eventDays.map((d) => ({
        id: d.id,
        date: d.date,
        label: d.label,
        dayNumber: d.dayNumber,
        status: d.status,
      })),
    };
  }

  buildPaymentBreakdown(breakdown: Array<{ paymentStatus: string; _count: number }>): DashboardPaymentBreakdown {
    const statusToKey: Record<string, keyof DashboardPaymentBreakdown> = {
      [PaymentStatus.PAID]: 'paid',
      [PaymentStatus.PARTIAL]: 'partial',
      [PaymentStatus.PENDING]: 'pending',
      [PaymentStatus.EXEMPT]: 'exempt',
    };

    return breakdown.reduce<DashboardPaymentBreakdown>(
      (acc, entry) => {
        const key = statusToKey[entry.paymentStatus];
        if (key) {
          acc[key] = entry._count;
        }
        return acc;
      },
      { paid: 0, partial: 0, pending: 0, exempt: 0 },
    );
  }

  private async buildPassengersByDay(
    eventId: string,
    eventDays: Array<{ id: string; date: Date; label: string; dayNumber: number; status: string }>,
    congregationId?: string,
  ): Promise<DashboardDayCount[]> {
    // Eventos de um único dia (assembleia) não precisam de quebra por dia — o total já atende.
    if (eventDays.length <= 1) {
      return [];
    }

    const grouped = await this.prisma.client.eventPassengerDay.groupBy({
      by: ['eventDayId'],
      where: { eventPassenger: { eventId, ...(congregationId ? { congregationId } : {}) } },
      _count: true,
    });

    const countByDay = new Map<string, number>(grouped.map((g) => [g.eventDayId, g._count]));

    return eventDays.map((day) => ({
      eventDayId: day.id,
      dayNumber: day.dayNumber,
      label: day.label,
      date: day.date,
      totalPassengers: countByDay.get(day.id) ?? 0,
    }));
  }

  private toPendingPassengerResponse(ep: {
    id: string;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    paymentStatus: string;
    passenger: { name: string };
  }): DashboardPendingPassenger {
    return {
      id: ep.id,
      passengerName: ep.passenger.name,
      totalAmount: formatMoney(ep.totalAmount),
      paidAmount: formatMoney(ep.paidAmount),
      pendingAmount: subtractMoney(ep.totalAmount, ep.paidAmount),
      paymentStatus: ep.paymentStatus,
    };
  }
}
