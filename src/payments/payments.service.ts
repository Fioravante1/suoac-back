import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { Prisma } from '../generated/prisma/client';
import {
  checkCircuitOwnership,
  checkCongregationPermission,
  isCircuitRole,
} from '../common/authorization/circuit-ownership.util';
import { resolveCongregationScope } from '../common/authorization/congregation-scope.util';
import { formatMoney } from '../common/money/money.util';
import { CongregationEventStatusService } from '../congregation-event-status/congregation-event-status.service';
import { EventStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { ListEventPaymentsQueryDto } from './dto/list-event-payments-query.dto';
import type { EventPaymentRow, EventPaymentsResponse } from './interfaces/event-payment-row.interface';
import type { PaymentResponse } from './interfaces/payment-response.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly congregationEventStatusService: CongregationEventStatusService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(eventPassengerId: string, user: JwtPayload, dto: CreatePaymentDto): Promise<PaymentResponse> {
    const ep = await this.prisma.client.eventPassenger.findUnique({
      where: { id: eventPassengerId },
      include: { event: true },
    });

    if (!ep) {
      this.logger.warn(`Inscrição não encontrada — id=${eventPassengerId}`);
      throw new NotFoundException('Inscrição não encontrada');
    }

    checkCircuitOwnership(user, ep.event.circuitId);
    this.ensureEventOpen(ep.event.status);
    this.checkPaymentDeadlinePermission(ep.event.paymentDeadline, user.role);
    checkCongregationPermission(user, ep.congregationId, 'pagamentos');
    await this.congregationEventStatusService.ensureNotFinalized(ep.eventId, ep.congregationId, user, 'pagamentos');

    if (ep.paymentStatus === PaymentStatus.EXEMPT) {
      throw new UnprocessableEntityException('Passageiro isento de pagamento');
    }

    const paidAtDate = new Date(dto.paidAt);
    if (paidAtDate > new Date()) {
      throw new UnprocessableEntityException('A data do pagamento não pode ser futura');
    }

    const paidAmount = Number(ep.paidAmount);
    const totalAmount = Number(ep.totalAmount);
    const remainingBalance = totalAmount - paidAmount;

    if (remainingBalance <= 0) {
      throw new UnprocessableEntityException('Passageiro já quitou o pagamento');
    }

    if (dto.amount > remainingBalance) {
      throw new UnprocessableEntityException(`Valor excede o saldo restante de R$ ${remainingBalance.toFixed(2)}`);
    }

    const newPaidAmount = paidAmount + dto.amount;
    const newPaymentStatus = this.calculatePaymentStatus(newPaidAmount, totalAmount);

    const payment = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.payment.create({
        data: {
          amount: dto.amount,
          paidAt: paidAtDate,
          observations: dto.observations ?? null,
          eventPassengerId,
          registeredById: user.sub,
        },
      });

      await tx.eventPassenger.update({
        where: { id: eventPassengerId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
      });

      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('CREATE', 'Payment', created.id, user.sub, {
          oldValues: null,
          newValues: created as unknown as Record<string, unknown>,
        }),
      });

      return created;
    });

    this.logger.log(
      `Pagamento registrado — id=${payment.id}, eventPassengerId=${eventPassengerId}, amount=${dto.amount}`,
    );
    return this.toResponse(payment);
  }

  async findByEventPassenger(eventPassengerId: string, user: JwtPayload): Promise<PaymentResponse[]> {
    const ep = await this.prisma.client.eventPassenger.findUnique({
      where: { id: eventPassengerId },
      include: { event: { select: { circuitId: true } } },
    });

    if (!ep) {
      this.logger.warn(`Inscrição não encontrada — id=${eventPassengerId}`);
      throw new NotFoundException('Inscrição não encontrada');
    }

    checkCircuitOwnership(user, ep.event.circuitId);
    checkCongregationPermission(user, ep.congregationId, 'pagamentos');

    this.logger.debug(`Listando pagamentos — eventPassengerId=${eventPassengerId}`);

    const payments = await this.prisma.client.payment.findMany({
      where: { eventPassengerId },
      orderBy: { paidAt: 'desc' },
    });

    return payments.map((p) => this.toResponse(p));
  }

  /**
   * Extrato consolidado de pagamentos do evento (livro de movimento): quem pagou,
   * quanto, quando, por congregação.
   * - Role de circuito: todos os pagamentos do evento; `congregationId` filtra (validado).
   * - Role de congregação: auto-restrito ao próprio `congregationId`.
   */
  async findByEvent(
    eventId: string,
    user: JwtPayload,
    query: ListEventPaymentsQueryDto,
  ): Promise<EventPaymentsResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { circuitId: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    const scope = await resolveCongregationScope(this.prisma, user, event.circuitId, query.congregationId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    this.logger.debug(`Listando pagamentos do evento — eventId=${eventId}, page=${page}, limit=${limit}`);

    const where: Prisma.PaymentWhereInput = {
      eventPassenger: {
        eventId,
        ...(scope ? { congregationId: scope } : {}),
      },
    };

    const [payments, total, aggregate] = await Promise.all([
      this.prisma.client.payment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          eventPassenger: {
            select: {
              passenger: { select: { name: true } },
              congregation: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.client.payment.count({ where }),
      this.prisma.client.payment.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      data: payments.map((p) => this.toEventPaymentRow(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalReceived: formatMoney(aggregate._sum.amount),
      },
    };
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id },
      include: { eventPassenger: { include: { event: true } } },
    });

    if (!payment) {
      this.logger.warn(`Pagamento não encontrado — id=${id}`);
      throw new NotFoundException('Pagamento não encontrado');
    }

    checkCircuitOwnership(user, payment.eventPassenger.event.circuitId);
    this.ensureEventOpen(payment.eventPassenger.event.status);
    this.checkPaymentDeadlinePermission(payment.eventPassenger.event.paymentDeadline, user.role);
    checkCongregationPermission(user, payment.eventPassenger.congregationId, 'pagamentos');
    await this.congregationEventStatusService.ensureNotFinalized(
      payment.eventPassenger.eventId,
      payment.eventPassenger.congregationId,
      user,
      'pagamentos',
    );

    const paidAmount = Number(payment.eventPassenger.paidAmount);
    const totalAmount = Number(payment.eventPassenger.totalAmount);
    const paymentAmount = Number(payment.amount);

    const newPaidAmount = paidAmount - paymentAmount;
    const newPaymentStatus = this.calculatePaymentStatus(newPaidAmount, totalAmount);

    await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.payment.delete({ where: { id } });
      await tx.eventPassenger.update({
        where: { id: payment.eventPassengerId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
      });
      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('DELETE', 'Payment', id, user.sub, {
          oldValues: payment as unknown as Record<string, unknown>,
          newValues: null,
        }),
      });
    });

    this.logger.warn(
      `Pagamento removido — id=${id}, eventPassengerId=${payment.eventPassengerId}, amount=${paymentAmount}`,
    );
  }

  private toResponse(payment: {
    id: string;
    amount: unknown;
    paidAt: Date;
    observations: string | null;
    eventPassengerId: string;
    registeredById: string;
    createdAt: Date;
  }): PaymentResponse {
    return {
      id: payment.id,
      amount: String(payment.amount),
      paidAt: payment.paidAt,
      observations: payment.observations,
      eventPassengerId: payment.eventPassengerId,
      registeredById: payment.registeredById,
      createdAt: payment.createdAt,
    };
  }

  private toEventPaymentRow(payment: {
    id: string;
    amount: Prisma.Decimal;
    paidAt: Date;
    observations: string | null;
    eventPassengerId: string;
    registeredById: string;
    createdAt: Date;
    eventPassenger: {
      passenger: { name: string };
      congregation: { id: string; name: string };
    };
  }): EventPaymentRow {
    return {
      id: payment.id,
      amount: formatMoney(payment.amount),
      paidAt: payment.paidAt,
      observations: payment.observations,
      eventPassengerId: payment.eventPassengerId,
      passengerName: payment.eventPassenger.passenger.name,
      congregationId: payment.eventPassenger.congregation.id,
      congregationName: payment.eventPassenger.congregation.name,
      registeredById: payment.registeredById,
      createdAt: payment.createdAt,
    };
  }

  private calculatePaymentStatus(paidAmount: number, totalAmount: number): PaymentStatus {
    if (paidAmount <= 0) {
      return PaymentStatus.PENDING;
    }

    if (paidAmount < totalAmount) {
      return PaymentStatus.PARTIAL;
    }

    return PaymentStatus.PAID;
  }

  private ensureEventOpen(status: string): void {
    if (status !== EventStatus.OPEN) {
      throw new UnprocessableEntityException(
        `Operação permitida apenas para eventos com status OPEN. Status atual: ${status}`,
      );
    }
  }

  private checkPaymentDeadlinePermission(deadline: Date, role: string): void {
    if (new Date() > deadline && !isCircuitRole(role)) {
      throw new UnprocessableEntityException('O prazo de pagamento expirou');
    }
  }
}
