import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  canExportSensitivePassengerData,
  checkCircuitOwnership,
  checkCongregationPermission,
  isCircuitRole,
} from '../common/authorization/circuit-ownership.util';
import { resolveCongregationScope } from '../common/authorization/congregation-scope.util';
import { EncryptionService } from '../common/encryption/encryption.service';
import { addMoney, compareMoney, formatMoney, multiplyMoney, subtractMoney } from '../common/money/money.util';
import { paymentStatusFromAmounts } from '../common/money/payment-status.util';
import { PDF_EXPORT_MAX_PASSENGERS } from '../common/pdf/pdf.constants';
import type {
  CongregationPdfBlock,
  ExportPdfResult,
  PassengerListPdfData,
  PassengerPdfRow,
} from '../common/pdf/interfaces/passenger-list-pdf.interface';
import { PdfService } from '../common/pdf/pdf.service';
import { formatPhone } from '../common/phone/phone.util';
import { CongregationEventStatusService } from '../congregation-event-status/congregation-event-status.service';
import type { Prisma } from '../generated/prisma/client';
import { EventDayStatus, EventStatus, EventType, PaymentStatus } from '../generated/prisma/enums';
import { PassengersService } from '../passengers/passengers.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventPassengerDto } from './dto/create-event-passenger.dto';
import type { EventPassengerQueryDto } from './dto/event-passenger-query.dto';
import type { UpdateEventPassengerDaysDto } from './dto/update-event-passenger-days.dto';
import type {
  EventPassengerDayResponse,
  EventPassengerFinancialSummary,
  EventPassengerResponse,
  PaginatedPassengerResponse,
} from './interfaces/event-passenger-response.interface';

@Injectable()
export class EventPassengersService {
  private readonly logger = new Logger(EventPassengersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passengersService: PassengersService,
    private readonly encryption: EncryptionService,
    private readonly congregationEventStatusService: CongregationEventStatusService,
    private readonly auditLogService: AuditLogService,
    private readonly pdfService: PdfService,
  ) {}

  async create(eventId: string, user: JwtPayload, dto: CreateEventPassengerDto): Promise<EventPassengerResponse> {
    this.validateCreateInput(dto);

    if (dto.payment && dto.exemptionReason) {
      throw new UnprocessableEntityException('Passageiro isento não pode ter pagamento');
    }

    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: { eventDays: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);
    this.ensureEventOpen(event.status);
    this.checkDeadlinePermission(event.registrationDeadline, user.role);

    let resolved: { passengerId: string; congregationId: string; rgHash: string };

    if (dto.passengerId) {
      resolved = await this.resolveExistingPassenger(dto.passengerId);
      checkCongregationPermission(user, resolved.congregationId, 'passageiros');
      await this.congregationEventStatusService.ensureNotFinalized(
        eventId,
        resolved.congregationId,
        user,
        'inscrições',
      );
    } else {
      this.validateInlinePermissions(user);
      const congregationId = user.congregationId!;
      checkCongregationPermission(user, congregationId, 'passageiros');
      await this.congregationEventStatusService.ensureNotFinalized(eventId, congregationId, user, 'inscrições');
      resolved = await this.resolveInlinePassenger(user, dto);
    }

    const existingEnrollment = await this.prisma.client.eventPassenger.findUnique({
      where: { eventId_passengerId: { eventId, passengerId: resolved.passengerId } },
    });

    if (existingEnrollment) {
      this.logger.warn(`Passageiro já inscrito no evento — eventId=${eventId}, passengerId=${resolved.passengerId}`);
      throw new ConflictException('Passageiro já inscrito neste evento');
    }

    const crossCongregation = await this.prisma.client.eventPassenger.findFirst({
      where: {
        eventId,
        passenger: { rgHash: resolved.rgHash },
        NOT: { passengerId: resolved.passengerId },
      },
    });

    if (crossCongregation) {
      this.logger.warn(`RG duplicado cross-congregation — eventId=${eventId}, passengerId=${resolved.passengerId}`);
      throw new ConflictException('Já existe um passageiro com este RG inscrito neste evento');
    }

    const activeDays = event.eventDays.filter((d) => d.status === EventDayStatus.ACTIVE);
    const selectedDayIds = this.resolveSelectedDays(event.type, activeDays, dto.dayIds);

    const totalAmount = multiplyMoney(event.ticketPrice, selectedDayIds.length);

    if (dto.payment) {
      this.validateInitialPayment(dto.payment, totalAmount, event.paymentDeadline, user.role);
    }

    const paidAmount = dto.payment ? dto.payment.amount : 0;
    const paymentStatus = dto.exemptionReason
      ? PaymentStatus.EXEMPT
      : paymentStatusFromAmounts(paidAmount, totalAmount);

    if (dto.payment) {
      return this.createWithPayment(
        eventId,
        user,
        dto,
        resolved,
        selectedDayIds,
        totalAmount,
        paidAmount,
        paymentStatus,
      );
    }

    const created = await this.prisma.client.eventPassenger.create({
      data: {
        totalAmount,
        paymentStatus,
        exemptionReason: dto.exemptionReason ?? null,
        observations: dto.observations ?? null,
        eventId,
        passengerId: resolved.passengerId,
        congregationId: resolved.congregationId,
        registeredById: user.sub,
        eventPassengerDays: {
          create: selectedDayIds.map((dayId) => ({ eventDayId: dayId })),
        },
      },
      include: {
        passenger: true,
        eventPassengerDays: { include: { eventDay: true } },
      },
    });

    this.logger.log(
      `Passageiro inscrito no evento — id=${created.id}, eventId=${eventId}, passengerId=${resolved.passengerId}`,
    );
    void this.auditLogService
      .log('CREATE', 'EventPassenger', created.id, user.sub, {
        oldValues: null,
        newValues: created as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: created.id }, 'Falha ao gravar audit log'));
    return this.toResponse(created);
  }

  async findByEvent(
    eventId: string,
    user: JwtPayload,
    query: EventPassengerQueryDto,
  ): Promise<PaginatedPassengerResponse> {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const isCircuit = isCircuitRole(user.role);

    this.logger.debug(`Listando inscrições — eventId=${eventId}, page=${page}, limit=${limit}`);

    // Escopo de congregação: roles de congregação ficam restritas à própria; roles de circuito
    // podem filtrar por uma congregação do circuito (validada). Reusa o mesmo helper do export.
    const congregationScope = await resolveCongregationScope(this.prisma, user, event.circuitId, query.congregationId);

    // Valida que os dias informados pertencem ao evento (422 caso contrário).
    const eventDayIds =
      query.eventDayIds && query.eventDayIds.length > 0
        ? await this.validateEventDaysFilter(eventId, query.eventDayIds)
        : undefined;

    // baseWhere = escopo (evento + congregação) — usado no financialSummary.
    const baseWhere: Prisma.EventPassengerWhereInput = {
      eventId,
      ...(congregationScope ? { congregationId: congregationScope } : {}),
    };

    // filteredWhere = baseWhere + filtros de busca — usado em findMany/count (meta.total).
    const filteredWhere: Prisma.EventPassengerWhereInput = {
      ...baseWhere,
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.name ? { passenger: { name: { contains: query.name, mode: 'insensitive' } } } : {}),
      ...(eventDayIds ? { eventPassengerDays: { some: { eventDayId: { in: eventDayIds } } } } : {}),
    };

    const [data, total, financialSummary] = await Promise.all([
      this.prisma.client.eventPassenger.findMany({
        where: filteredWhere,
        orderBy: { passenger: { name: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          passenger: true,
          congregation: { select: { name: true } },
          eventPassengerDays: { include: { eventDay: true } },
        },
      }),
      this.prisma.client.eventPassenger.count({ where: filteredWhere }),
      this.buildFinancialSummary(baseWhere),
    ]);

    return {
      data: data.map((ep) => this.toResponse(ep, isCircuit ? ep.congregation.name : undefined)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      financialSummary,
    };
  }

  async exportPdf(
    circuitId: string,
    eventId: string,
    user: JwtPayload,
    dto: { congregationId?: string; includeSensitive?: boolean },
  ): Promise<ExportPdfResult> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: { circuit: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    // Evento de outro circuito → NotFound (não revela que existe em outro circuito)
    if (event.circuitId !== circuitId) {
      this.logger.warn(`Evento fora do circuito do path — eventId=${eventId}, circuitId=${circuitId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    const includeSensitive = dto.includeSensitive ?? false;

    if (includeSensitive && !canExportSensitivePassengerData(user.role)) {
      this.logger.warn(`Tentativa de exportar RG sem permissão — userId=${user.sub}, role=${user.role}`);
      throw new ForbiddenException('Sem permissão para exportar dados sensíveis (RG)');
    }

    const effectiveCongregationId = await resolveCongregationScope(
      this.prisma,
      user,
      event.circuitId,
      dto.congregationId,
    );

    const where: Prisma.EventPassengerWhereInput = {
      eventId,
      ...(effectiveCongregationId ? { congregationId: effectiveCongregationId } : {}),
    };

    const total = await this.prisma.client.eventPassenger.count({ where });

    if (total > PDF_EXPORT_MAX_PASSENGERS) {
      throw new UnprocessableEntityException(
        `O evento possui ${total} inscritos. Exporte por congregação usando o parâmetro congregationId.`,
      );
    }

    const requester = await this.prisma.client.user.findUnique({
      where: { id: user.sub },
      select: { name: true },
    });
    const generatedByName = requester?.name ?? 'Usuário desconhecido';

    const enrollments = await this.prisma.client.eventPassenger.findMany({
      where,
      orderBy: [{ congregation: { name: 'asc' } }, { passenger: { name: 'asc' } }],
      include: {
        passenger: true,
        congregation: { include: { circuit: true } },
      },
    });

    const data: PassengerListPdfData = {
      eventTitle: `${this.getEventTypeLabel(event.type)} ${event.title}`,
      eventVenue: event.venue,
      eventCity: event.city,
      eventState: event.state,
      circuitName: event.circuit.name,
      generatedAt: new Date(),
      generatedByName,
      includeSensitive,
      congregations: this.groupForPdf(enrollments, includeSensitive),
    };

    const buffer = await this.pdfService.generatePassengerList(data);

    this.logger.log(
      `PDF de inscritos exportado — eventId=${eventId}, total=${total}, includeSensitive=${includeSensitive}`,
    );

    void this.auditLogService
      .log('EXPORT', 'EventPassengerPdf', eventId, user.sub, {
        oldValues: null,
        newValues: {
          eventId,
          circuitId,
          congregationId: effectiveCongregationId ?? null,
          includeSensitive,
          totalPassengers: total,
        },
      })
      .catch((err: unknown) => this.logger.error({ err }, 'Falha ao gravar audit log de export PDF'));

    let congregationCode: string | undefined;
    if (effectiveCongregationId) {
      congregationCode =
        enrollments[0]?.congregation.code ??
        (
          await this.prisma.client.congregation.findUnique({
            where: { id: effectiveCongregationId },
            select: { code: true },
          })
        )?.code;
    }

    return { buffer, congregationCode };
  }

  /**
   * Valida que todos os dias informados no filtro pertencem ao evento. UUIDs
   * malformados já foram barrados na DTO (400); aqui, um UUID válido que não
   * pertence ao evento é semanticamente inválido → 422. Dias cancelados são
   * aceitos (operação de leitura). Retorna os IDs deduplicados validados.
   */
  private async validateEventDaysFilter(eventId: string, requestedDayIds: string[]): Promise<string[]> {
    const uniqueDayIds = [...new Set(requestedDayIds)];

    const eventDays = await this.prisma.client.eventDay.findMany({
      where: { eventId, id: { in: uniqueDayIds } },
      select: { id: true },
    });

    const foundIds = new Set(eventDays.map((d) => d.id));
    const invalidDayId = uniqueDayIds.find((id) => !foundIds.has(id));

    if (invalidDayId) {
      throw new UnprocessableEntityException(`Dia não pertence ao evento: ${invalidDayId}`);
    }

    return uniqueDayIds;
  }

  private groupForPdf(
    enrollments: Array<{
      observations: string | null;
      passenger: { name: string; rgEncrypted: string; phone: string | null };
      congregation: { name: string; code: string; circuit: { name: string } };
    }>,
    includeSensitive: boolean,
  ): CongregationPdfBlock[] {
    const blocks = new Map<string, CongregationPdfBlock>();

    for (const ep of enrollments) {
      const key = ep.congregation.code;
      let block = blocks.get(key);
      if (!block) {
        block = {
          congregationName: ep.congregation.name,
          congregationCode: ep.congregation.code,
          circuitName: ep.congregation.circuit.name,
          passengers: [],
        };
        blocks.set(key, block);
      }

      const row: PassengerPdfRow = {
        index: block.passengers.length + 1,
        name: ep.passenger.name,
        rg: includeSensitive ? this.encryption.decrypt(ep.passenger.rgEncrypted) : null,
        phone: ep.passenger.phone,
        observations: ep.observations,
      };
      block.passengers.push(row);
    }

    return [...blocks.values()];
  }

  /**
   * Rótulo legível do tipo de evento, usado para compor o título no PDF
   * (ex.: "Congresso Felicidade Eterna", "Assembleia Ouça o que o espírito...").
   */
  private getEventTypeLabel(type: EventType): string {
    const labels: Record<EventType, string> = {
      [EventType.REGIONAL_CONVENTION]: 'Congresso',
      [EventType.ASSEMBLY]: 'Assembleia',
    };
    return labels[type];
  }

  async findOne(id: string, user: JwtPayload): Promise<EventPassengerResponse> {
    const ep = await this.prisma.client.eventPassenger.findUnique({
      where: { id },
      include: {
        event: { select: { circuitId: true } },
        passenger: true,
        eventPassengerDays: { include: { eventDay: true } },
      },
    });

    if (!ep) {
      this.logger.warn(`Inscrição não encontrada — id=${id}`);
      throw new NotFoundException('Inscrição não encontrada');
    }

    checkCircuitOwnership(user, ep.event.circuitId);

    return this.toResponse(ep);
  }

  async updateDays(id: string, dto: UpdateEventPassengerDaysDto, user: JwtPayload): Promise<EventPassengerResponse> {
    const ep = await this.prisma.client.eventPassenger.findUnique({
      where: { id },
      include: {
        event: { include: { eventDays: true } },
        passenger: true,
      },
    });

    if (!ep) {
      this.logger.warn(`Inscrição não encontrada — id=${id}`);
      throw new NotFoundException('Inscrição não encontrada');
    }

    checkCircuitOwnership(user, ep.event.circuitId);
    this.ensureEventOpen(ep.event.status);
    checkCongregationPermission(user, ep.congregationId, 'passageiros');
    await this.congregationEventStatusService.ensureNotFinalized(ep.eventId, ep.congregationId, user, 'inscrições');

    const activeDays = ep.event.eventDays.filter((d) => d.status === EventDayStatus.ACTIVE);
    const activeDayIds = new Set(activeDays.map((d) => d.id));
    const invalidDayId = dto.dayIds.find((dayId) => !activeDayIds.has(dayId));

    if (invalidDayId) {
      throw new UnprocessableEntityException(`Dia inválido ou cancelado: ${invalidDayId}`);
    }

    const newTotalAmount = multiplyMoney(ep.event.ticketPrice, dto.dayIds.length);

    const newPaymentStatus: PaymentStatus =
      ep.paymentStatus === PaymentStatus.EXEMPT
        ? PaymentStatus.EXEMPT
        : paymentStatusFromAmounts(ep.paidAmount, newTotalAmount);

    if (compareMoney(ep.paidAmount, newTotalAmount) > 0 && ep.paymentStatus !== PaymentStatus.EXEMPT) {
      this.logger.warn(
        `Crédito detectado após alteração de dias — id=${id}, paidAmount=${formatMoney(ep.paidAmount)}, newTotalAmount=${newTotalAmount}`,
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.eventPassengerDay.deleteMany({
        where: { eventPassengerId: id },
      }),
      this.prisma.client.eventPassengerDay.createMany({
        data: dto.dayIds.map((dayId) => ({
          eventPassengerId: id,
          eventDayId: dayId,
        })),
      }),
      this.prisma.client.eventPassenger.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          paymentStatus: newPaymentStatus,
        },
      }),
    ]);

    const updated = await this.prisma.client.eventPassenger.findUnique({
      where: { id },
      include: {
        passenger: true,
        eventPassengerDays: { include: { eventDay: true } },
      },
    });

    this.logger.log(`Dias da inscrição atualizados — id=${id}, days=${dto.dayIds.length}`);
    void this.auditLogService
      .log('UPDATE', 'EventPassenger', id, user.sub, {
        oldValues: ep as unknown as Record<string, unknown>,
        newValues: updated as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
    return this.toResponse(updated!);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const ep = await this.prisma.client.eventPassenger.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!ep) {
      this.logger.warn(`Inscrição não encontrada — id=${id}`);
      throw new NotFoundException('Inscrição não encontrada');
    }

    checkCircuitOwnership(user, ep.event.circuitId);
    this.ensureEventOpen(ep.event.status);
    this.checkDeadlinePermission(ep.event.registrationDeadline, user.role);
    checkCongregationPermission(user, ep.congregationId, 'passageiros');
    await this.congregationEventStatusService.ensureNotFinalized(ep.eventId, ep.congregationId, user, 'inscrições');

    await this.prisma.client.eventPassenger.delete({ where: { id } });

    this.logger.warn(
      `Inscrição removida (hard-delete) — id=${id}, eventId=${ep.eventId}, passengerId=${ep.passengerId}`,
    );
    void this.auditLogService
      .log('DELETE', 'EventPassenger', id, user.sub, {
        oldValues: ep as unknown as Record<string, unknown>,
        newValues: null,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
  }

  private async buildFinancialSummary(
    baseWhere: Prisma.EventPassengerWhereInput,
  ): Promise<EventPassengerFinancialSummary> {
    const breakdown = await this.prisma.client.eventPassenger.groupBy({
      by: ['paymentStatus'],
      where: baseWhere,
      _count: true,
      _sum: { totalAmount: true, paidAmount: true },
    });

    let totalPassengers = 0;
    let totalExpected = '0.00';
    let totalReceived = '0.00';

    const statusToKey: Record<string, keyof EventPassengerFinancialSummary['byStatus']> = {
      [PaymentStatus.PAID]: 'paid',
      [PaymentStatus.PARTIAL]: 'partial',
      [PaymentStatus.PENDING]: 'pending',
      [PaymentStatus.EXEMPT]: 'exempt',
    };

    const byStatus = breakdown.reduce<EventPassengerFinancialSummary['byStatus']>(
      (acc, entry) => {
        totalPassengers += entry._count;
        if (entry.paymentStatus !== PaymentStatus.EXEMPT) {
          totalExpected = addMoney(totalExpected, entry._sum.totalAmount);
          totalReceived = addMoney(totalReceived, entry._sum.paidAmount);
        }
        const key = statusToKey[entry.paymentStatus];
        if (key) {
          acc[key] = entry._count;
        }
        return acc;
      },
      { paid: 0, partial: 0, pending: 0, exempt: 0 },
    );

    return {
      totalPassengers,
      totalExpected,
      totalReceived,
      totalPending: subtractMoney(totalExpected, totalReceived),
      byStatus,
    };
  }

  private validateInitialPayment(
    payment: { amount: number; paidAt: string },
    totalAmount: string,
    paymentDeadline: Date,
    role: string,
  ): void {
    const paidAtDate = new Date(payment.paidAt);
    if (paidAtDate > new Date()) {
      throw new UnprocessableEntityException('A data do pagamento não pode ser futura');
    }

    if (compareMoney(payment.amount, totalAmount) > 0) {
      throw new UnprocessableEntityException(`Valor do pagamento excede o total de R$ ${totalAmount}`);
    }

    if (new Date() > paymentDeadline && !isCircuitRole(role)) {
      throw new UnprocessableEntityException('O prazo de pagamento expirou');
    }
  }

  private async createWithPayment(
    eventId: string,
    user: JwtPayload,
    dto: CreateEventPassengerDto,
    resolved: { passengerId: string; congregationId: string },
    selectedDayIds: string[],
    totalAmount: string,
    paidAmount: number,
    paymentStatus: PaymentStatus,
  ): Promise<EventPassengerResponse> {
    const payment = dto.payment!;

    const created = await this.prisma.client.$transaction(async (tx: Prisma.TransactionClient) => {
      const ep = await tx.eventPassenger.create({
        data: {
          totalAmount,
          paidAmount,
          paymentStatus,
          exemptionReason: null,
          observations: dto.observations ?? null,
          eventId,
          passengerId: resolved.passengerId,
          congregationId: resolved.congregationId,
          registeredById: user.sub,
          eventPassengerDays: {
            create: selectedDayIds.map((dayId) => ({ eventDayId: dayId })),
          },
        },
        include: {
          passenger: true,
          eventPassengerDays: { include: { eventDay: true } },
        },
      });

      const createdPayment = await tx.payment.create({
        data: {
          amount: payment.amount,
          paidAt: new Date(payment.paidAt),
          observations: payment.observations ?? null,
          eventPassengerId: ep.id,
          registeredById: user.sub,
        },
      });

      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('CREATE', 'EventPassenger', ep.id, user.sub, {
          oldValues: null,
          newValues: ep as unknown as Record<string, unknown>,
        }),
      });

      await tx.auditLog.create({
        data: this.auditLogService.buildCreateData('CREATE', 'Payment', createdPayment.id, user.sub, {
          oldValues: null,
          newValues: createdPayment as unknown as Record<string, unknown>,
        }),
      });

      return ep;
    });

    this.logger.log(
      `Passageiro inscrito com pagamento — id=${created.id}, eventId=${eventId}, passengerId=${resolved.passengerId}, amount=${payment.amount}`,
    );
    return this.toResponse(created);
  }

  private validateCreateInput(dto: CreateEventPassengerDto): void {
    const hasPassengerId = dto.passengerId !== undefined;
    const hasInlineData = dto.name !== undefined || dto.rg !== undefined;

    if (hasPassengerId && hasInlineData) {
      throw new UnprocessableEntityException('Envie passengerId OU name+rg, não ambos');
    }

    if (!hasPassengerId && !hasInlineData) {
      throw new UnprocessableEntityException('Envie passengerId ou name+rg para identificar o passageiro');
    }

    if (hasInlineData && (!dto.name || !dto.rg)) {
      throw new UnprocessableEntityException('Ao criar passageiro inline, name e rg são obrigatórios');
    }
  }

  private async resolveExistingPassenger(
    passengerId: string,
  ): Promise<{ passengerId: string; congregationId: string; rgHash: string }> {
    const passenger = await this.prisma.client.passenger.findUnique({
      where: { id: passengerId },
    });

    if (!passenger) {
      this.logger.warn(`Passageiro não encontrado — id=${passengerId}`);
      throw new NotFoundException('Passageiro não encontrado');
    }

    return { passengerId: passenger.id, congregationId: passenger.congregationId, rgHash: passenger.rgHash };
  }

  private validateInlinePermissions(user: JwtPayload): void {
    if (!user.congregationId) {
      throw new UnprocessableEntityException(
        'Usuários sem congregação vinculada devem usar passengerId para inscrever passageiros',
      );
    }
  }

  private async resolveInlinePassenger(
    user: JwtPayload,
    dto: CreateEventPassengerDto,
  ): Promise<{ passengerId: string; congregationId: string; rgHash: string }> {
    const congregationId = user.congregationId!;

    try {
      const created = await this.passengersService.create(
        congregationId,
        {
          name: dto.name!,
          rg: dto.rg!,
          phone: dto.phone,
        },
        user,
      );

      const passenger = await this.prisma.client.passenger.findUnique({
        where: { id: created.id },
      });

      return { passengerId: created.id, congregationId, rgHash: passenger!.rgHash };
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }

      const normalizedRg = dto.rg!.replace(/[.-]/g, '').toUpperCase();
      const rgHash = this.encryption.hash(normalizedRg);

      const existing = await this.prisma.client.passenger.findUnique({
        where: { congregationId_rgHash: { congregationId, rgHash } },
      });

      if (!existing) {
        throw error;
      }

      return { passengerId: existing.id, congregationId: existing.congregationId, rgHash: existing.rgHash };
    }
  }

  private resolveSelectedDays(
    eventType: string,
    activeDays: Array<{ id: string; status: string }>,
    dayIds?: string[],
  ): string[] {
    if (eventType === EventType.ASSEMBLY) {
      if (activeDays.length === 0) {
        throw new UnprocessableEntityException('O evento não possui dias ativos');
      }
      return [activeDays[0]!.id];
    }

    if (!dayIds || dayIds.length === 0) {
      throw new UnprocessableEntityException('dayIds é obrigatório para congressos regionais');
    }

    const activeDayIds = new Set(activeDays.map((d) => d.id));
    const invalidDayId = dayIds.find((dayId) => !activeDayIds.has(dayId));

    if (invalidDayId) {
      throw new UnprocessableEntityException(`Dia inválido ou cancelado: ${invalidDayId}`);
    }

    return dayIds;
  }

  private toResponse(
    ep: {
      id: string;
      totalAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      paymentStatus: string;
      exemptionReason: string | null;
      observations: string | null;
      eventId: string;
      congregationId: string;
      registeredById: string;
      createdAt: Date;
      updatedAt: Date;
      passenger: {
        id: string;
        name: string;
        rgEncrypted: string;
        phone: string | null;
      };
      eventPassengerDays: Array<{
        id: string;
        checkedIn: boolean;
        checkedInAt: Date | null;
        eventDayId: string;
        eventDay: {
          dayNumber: number;
          date: Date;
          label: string;
        };
      }>;
    },
    congregationName?: string,
  ): EventPassengerResponse {
    return {
      id: ep.id,
      passenger: {
        id: ep.passenger.id,
        name: ep.passenger.name,
        rg: this.encryption.decrypt(ep.passenger.rgEncrypted),
        phone: formatPhone(ep.passenger.phone),
      },
      totalAmount: formatMoney(ep.totalAmount),
      paidAmount: formatMoney(ep.paidAmount),
      paymentStatus: ep.paymentStatus,
      exemptionReason: ep.exemptionReason,
      observations: ep.observations,
      eventId: ep.eventId,
      congregationId: ep.congregationId,
      ...(congregationName !== undefined && { congregationName }),
      registeredById: ep.registeredById,
      createdAt: ep.createdAt,
      updatedAt: ep.updatedAt,
      days: ep.eventPassengerDays.map((d) => this.toDayResponse(d)),
    };
  }

  private toDayResponse(day: {
    id: string;
    checkedIn: boolean;
    checkedInAt: Date | null;
    eventDayId: string;
    eventDay: {
      dayNumber: number;
      date: Date;
      label: string;
    };
  }): EventPassengerDayResponse {
    return {
      id: day.id,
      eventDayId: day.eventDayId,
      dayNumber: day.eventDay.dayNumber,
      date: day.eventDay.date,
      label: day.eventDay.label,
      checkedIn: day.checkedIn,
      checkedInAt: day.checkedInAt,
    };
  }

  private ensureEventOpen(status: string): void {
    if (status !== EventStatus.OPEN) {
      throw new UnprocessableEntityException(
        `Operação permitida apenas para eventos com status OPEN. Status atual: ${status}`,
      );
    }
  }

  private checkDeadlinePermission(registrationDeadline: Date, role: string): void {
    if (new Date() > registrationDeadline && !isCircuitRole(role)) {
      throw new UnprocessableEntityException('O prazo de inscrição expirou');
    }
  }
}
