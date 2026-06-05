import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { CongregationListStatus, EventStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CongregationDashboardResponse,
  DashboardPaymentBreakdown,
  DashboardPendingPassenger,
} from './interfaces/congregation-dashboard-response.interface';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCongregationDashboard(
    eventId: string,
    user: JwtPayload,
    congregationId?: string,
  ): Promise<CongregationDashboardResponse> {
    const resolvedCongregationId = this.resolveCongregationId(user, congregationId);

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

    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: resolvedCongregationId, circuitId: event.circuitId, isActive: true },
    });

    if (!congregation) {
      this.logger.warn(`Congregação não encontrada — id=${resolvedCongregationId}`);
      throw new NotFoundException('Congregação não encontrada');
    }

    const where = { eventId, congregationId: resolvedCongregationId };

    const [totals, breakdown, status, pendingPassengers, totalPendingPassengers] = await Promise.all([
      this.prisma.client.eventPassenger.aggregate({
        where,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.client.eventPassenger.groupBy({
        by: ['paymentStatus'],
        where,
        _count: true,
      }),
      this.prisma.client.congregationEventStatus.findUnique({
        where: { congregationId_eventId: { congregationId: resolvedCongregationId, eventId } },
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
    ]);

    const totalExpected = Number(totals._sum.totalAmount ?? 0);
    const totalReceived = Number(totals._sum.paidAmount ?? 0);
    const totalPending = totalExpected - totalReceived;

    const paymentBreakdown = this.buildPaymentBreakdown(breakdown);

    this.logger.debug(
      `Dashboard carregado — eventId=${eventId}, congregationId=${resolvedCongregationId}, passengers=${totals._count}`,
    );

    return {
      event: {
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
      },
      congregation: {
        id: congregation.id,
        name: congregation.name,
        listStatus: status?.status ?? CongregationListStatus.PENDING,
      },
      stats: {
        totalPassengers: totals._count,
        totalExpected: totalExpected.toFixed(2),
        totalReceived: totalReceived.toFixed(2),
        totalPending: totalPending.toFixed(2),
      },
      paymentBreakdown,
      pendingPassengers: pendingPassengers.map((ep) => this.toPendingPassengerResponse(ep)),
      totalPendingPassengers,
    };
  }

  private resolveCongregationId(user: JwtPayload, congregationId?: string): string {
    if (!isCircuitRole(user.role)) {
      return user.congregationId!;
    }

    if (!congregationId) {
      throw new UnprocessableEntityException('O parâmetro congregationId é obrigatório para coordenadores de circuito');
    }

    return congregationId;
  }

  private buildPaymentBreakdown(
    breakdown: Array<{ paymentStatus: string; _count: number }>,
  ): DashboardPaymentBreakdown {
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

  private toPendingPassengerResponse(ep: {
    id: string;
    totalAmount: unknown;
    paidAmount: unknown;
    paymentStatus: string;
    passenger: { name: string };
  }): DashboardPendingPassenger {
    const total = Number(ep.totalAmount);
    const paid = Number(ep.paidAmount);

    return {
      id: ep.id,
      passengerName: ep.passenger.name,
      totalAmount: total.toFixed(2),
      paidAmount: paid.toFixed(2),
      pendingAmount: (total - paid).toFixed(2),
      paymentStatus: ep.paymentStatus,
    };
  }
}
