import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  checkCircuitOwnership,
  checkCongregationPermission,
  isCircuitRole,
} from '../common/authorization/circuit-ownership.util';
import { EventStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { PaymentResponse } from './interfaces/payment-response.interface';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const [payment] = await this.prisma.client.$transaction([
      this.prisma.client.payment.create({
        data: {
          amount: dto.amount,
          paidAt: paidAtDate,
          observations: dto.observations ?? null,
          eventPassengerId,
          registeredById: user.sub,
        },
      }),
      this.prisma.client.eventPassenger.update({
        where: { id: eventPassengerId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
      }),
    ]);

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

    const paidAmount = Number(payment.eventPassenger.paidAmount);
    const totalAmount = Number(payment.eventPassenger.totalAmount);
    const paymentAmount = Number(payment.amount);

    const newPaidAmount = paidAmount - paymentAmount;
    const newPaymentStatus = this.calculatePaymentStatus(newPaidAmount, totalAmount);

    await this.prisma.client.$transaction([
      this.prisma.client.payment.delete({ where: { id } }),
      this.prisma.client.eventPassenger.update({
        where: { id: payment.eventPassengerId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
        },
      }),
    ]);

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
