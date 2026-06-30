import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { Prisma } from '../generated/prisma/client';
import {
  checkCircuitOwnership,
  checkCongregationPermission,
  isCircuitRole,
} from '../common/authorization/circuit-ownership.util';
import { resolveCongregationScope } from '../common/authorization/congregation-scope.util';
import { FINANCIAL_EXPORT_MAX_ROWS, PDF_CONTENT_TYPE, XLSX_CONTENT_TYPE } from '../common/export/export.constants';
import type { ExportFileResult, PaymentsExtractExportData } from '../common/export/financial-export.interface';
import { addMoney, compareMoney, formatMoney, subtractMoney } from '../common/money/money.util';
import { paymentStatusFromAmounts } from '../common/money/payment-status.util';
import { PdfService } from '../common/pdf/pdf.service';
import { XlsxService } from '../common/xlsx/xlsx.service';
import { CongregationEventStatusService } from '../congregation-event-status/congregation-event-status.service';
import { EventStatus, EventType, PaymentStatus, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { ExportEventPaymentsQueryDto } from './dto/export-event-payments-query.dto';
import type { ListEventPaymentsQueryDto } from './dto/list-event-payments-query.dto';
import type { EventPaymentRow, EventPaymentsResponse } from './interfaces/event-payment-row.interface';
import type { PaymentResponse } from './interfaces/payment-response.interface';
import type { PaymentReceiptResult } from './interfaces/payment-receipt-result.interface';

/** Include compartilhado para montar `EventPaymentRow` (extrato paginado e export). */
const EVENT_PAYMENT_INCLUDE = {
  eventPassenger: {
    select: {
      passenger: { select: { name: true } },
      congregation: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly congregationEventStatusService: CongregationEventStatusService,
    private readonly auditLogService: AuditLogService,
    private readonly pdfService: PdfService,
    private readonly xlsxService: XlsxService,
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

    const remainingBalance = subtractMoney(ep.totalAmount, ep.paidAmount);

    if (compareMoney(remainingBalance, 0) <= 0) {
      throw new UnprocessableEntityException('Passageiro já quitou o pagamento');
    }

    if (compareMoney(dto.amount, remainingBalance) > 0) {
      throw new UnprocessableEntityException(`Valor excede o saldo restante de R$ ${remainingBalance}`);
    }

    const newPaidAmount = addMoney(ep.paidAmount, dto.amount);
    const newPaymentStatus = paymentStatusFromAmounts(newPaidAmount, ep.totalAmount);

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

    const where = this.buildEventPaymentsWhere(eventId, scope);

    const [payments, total, aggregate] = await Promise.all([
      this.prisma.client.payment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: EVENT_PAYMENT_INCLUDE,
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

  /**
   * Gera o recibo de pagamento (formulário S-24-T) de uma congregação no evento,
   * consolidando o total recebido. Rota sob `:circuitId` — valida que o evento
   * pertence ao circuito do path. Recibo é por congregação: role de circuito
   * DEVE informar `congregationId`; role de congregação usa a própria.
   */
  async generateReceipt(
    circuitId: string,
    eventId: string,
    user: JwtPayload,
    congregationId?: string,
  ): Promise<PaymentReceiptResult> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { title: true, type: true, circuitId: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    // Evento de outro circuito → 404 (não revela existência em outro circuito)
    if (event.circuitId !== circuitId) {
      this.logger.warn(`Evento fora do circuito do path — eventId=${eventId}, circuitId=${circuitId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    const scope = await resolveCongregationScope(this.prisma, user, event.circuitId, congregationId);

    // Recibo é por congregação: role de circuito sem filtro → contrato incompleto.
    if (!scope) {
      throw new BadRequestException('Informe congregationId para gerar o recibo da congregação');
    }

    const congregation = await this.prisma.client.congregation.findUnique({
      where: { id: scope },
      select: { name: true, code: true },
    });

    if (!congregation) {
      throw new NotFoundException('Congregação não encontrada');
    }

    const [aggregate, requester, coordinator] = await Promise.all([
      this.prisma.client.payment.aggregate({
        where: { eventPassenger: { eventId, congregationId: scope } },
        _sum: { amount: true },
      }),
      this.prisma.client.user.findUnique({ where: { id: user.sub }, select: { name: true } }),
      this.prisma.client.user.findFirst({
        where: { circuitId: event.circuitId, role: UserRole.CIRCUIT_COORDINATOR, isActive: true },
        select: { name: true },
      }),
    ]);

    const totalReceived = formatMoney(aggregate._sum.amount);

    const buffer = await this.pdfService.generatePaymentReceipt({
      date: new Date(),
      eventTypeLabel: this.getEventTypeLabel(event.type),
      eventTitle: event.title,
      congregationName: congregation.name,
      totalReceived,
      filledByName: requester?.name ?? 'Usuário desconhecido',
      coordinatorName: coordinator?.name ?? null,
    });

    this.logger.log(`Recibo de pagamento gerado — eventId=${eventId}, congregationId=${scope}`);

    void this.auditLogService
      .log('EXPORT', 'PaymentReceipt', eventId, user.sub, {
        oldValues: null,
        newValues: { eventId, circuitId, congregationId: scope, totalReceived },
      })
      .catch((err: unknown) => this.logger.error({ err }, 'Falha ao gravar audit log de recibo'));

    return { buffer, congregationCode: congregation.code };
  }

  /**
   * Exporta o extrato consolidado de pagamentos do evento (PDF ou XLSX). Rota sob
   * `:circuitId` — valida que o evento pertence ao circuito do path (404 cross-circuit).
   * Busca o recorte completo (sem paginação) com teto defensivo (`422` acima do limite).
   */
  async exportPayments(
    circuitId: string,
    eventId: string,
    user: JwtPayload,
    query: ExportEventPaymentsQueryDto,
  ): Promise<ExportFileResult> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { title: true, circuitId: true },
    });

    if (!event || event.circuitId !== circuitId) {
      this.logger.warn(`Evento não encontrado ou fora do circuito — eventId=${eventId}, circuitId=${circuitId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    const scope = await resolveCongregationScope(this.prisma, user, event.circuitId, query.congregationId);
    const where = this.buildEventPaymentsWhere(eventId, scope);

    const total = await this.prisma.client.payment.count({ where });
    if (total > FINANCIAL_EXPORT_MAX_ROWS) {
      throw new UnprocessableEntityException(
        `Exportação excede ${FINANCIAL_EXPORT_MAX_ROWS} pagamentos. Filtre por congregação para reduzir o volume.`,
      );
    }

    const [payments, aggregate, congregation, requester] = await Promise.all([
      this.prisma.client.payment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        include: EVENT_PAYMENT_INCLUDE,
      }),
      this.prisma.client.payment.aggregate({ where, _sum: { amount: true } }),
      scope
        ? this.prisma.client.congregation.findUnique({ where: { id: scope }, select: { name: true, code: true } })
        : null,
      this.prisma.client.user.findUnique({ where: { id: user.sub }, select: { name: true } }),
    ]);

    const format = query.format ?? 'pdf';
    const data: PaymentsExtractExportData = {
      eventTitle: event.title,
      generatedAt: new Date(),
      generatedByName: requester?.name ?? 'Usuário desconhecido',
      congregationName: congregation?.name ?? null,
      rows: payments.map((p) => this.toEventPaymentRow(p)),
      totalReceived: formatMoney(aggregate._sum.amount),
    };

    const buffer =
      format === 'xlsx'
        ? await this.xlsxService.generatePaymentsExtract(data)
        : await this.pdfService.generatePaymentsExtractPdf(data);

    this.logger.log(`Extrato de pagamentos exportado — eventId=${eventId}, format=${format}, rows=${total}`);

    void this.auditLogService
      .log('EXPORT', 'EventPayments', eventId, user.sub, {
        oldValues: null,
        newValues: { eventId, circuitId, congregationId: scope ?? null, format, totalRows: total },
      })
      .catch((err: unknown) => this.logger.error({ err }, 'Falha ao gravar audit log de export'));

    const safeCode = congregation?.code ? `${congregation.code.replace(/[^a-zA-Z0-9_-]/g, '-')}-` : '';
    return {
      buffer,
      filename: `extrato-pagamentos-${safeCode}${eventId}.${format}`,
      contentType: format === 'xlsx' ? XLSX_CONTENT_TYPE : PDF_CONTENT_TYPE,
    };
  }

  private buildEventPaymentsWhere(eventId: string, scope: string | undefined): Prisma.PaymentWhereInput {
    return {
      eventPassenger: {
        eventId,
        ...(scope ? { congregationId: scope } : {}),
      },
    };
  }

  private getEventTypeLabel(type: EventType): string {
    const labels: Record<EventType, string> = {
      [EventType.REGIONAL_CONVENTION]: 'Congresso',
      [EventType.ASSEMBLY]: 'Assembleia',
    };
    return labels[type];
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

    const newPaidAmount = subtractMoney(payment.eventPassenger.paidAmount, payment.amount);
    const newPaymentStatus = paymentStatusFromAmounts(newPaidAmount, payment.eventPassenger.totalAmount);

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
      `Pagamento removido — id=${id}, eventPassengerId=${payment.eventPassengerId}, amount=${formatMoney(payment.amount)}`,
    );
  }

  private toResponse(payment: {
    id: string;
    amount: Prisma.Decimal;
    paidAt: Date;
    observations: string | null;
    eventPassengerId: string;
    registeredById: string;
    createdAt: Date;
  }): PaymentResponse {
    return {
      id: payment.id,
      amount: formatMoney(payment.amount),
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
