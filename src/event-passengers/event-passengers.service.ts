import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { EncryptionService } from '../common/encryption/encryption.service';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { EventDayStatus, EventStatus, EventType, PaymentStatus } from '../generated/prisma/enums';
import { PassengersService } from '../passengers/passengers.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventPassengerDto } from './dto/create-event-passenger.dto';
import type { UpdateEventPassengerDaysDto } from './dto/update-event-passenger-days.dto';
import type {
  EventPassengerDayResponse,
  EventPassengerResponse,
} from './interfaces/event-passenger-response.interface';

@Injectable()
export class EventPassengersService {
  private readonly logger = new Logger(EventPassengersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passengersService: PassengersService,
    private readonly encryption: EncryptionService,
  ) {}

  async create(eventId: string, user: JwtPayload, dto: CreateEventPassengerDto): Promise<EventPassengerResponse> {
    this.validateCreateInput(dto);

    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      include: { eventDays: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    this.ensureEventOpen(event.status);
    this.checkDeadlinePermission(event.registrationDeadline, user.role);

    const resolved = dto.passengerId
      ? await this.resolveExistingPassenger(dto.passengerId)
      : await this.resolveInlinePassenger(user, dto);

    this.checkCongregationPermission(user, resolved.congregationId);

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

    const totalAmount = Number(event.ticketPrice) * selectedDayIds.length;
    const paymentStatus = dto.exemptionReason ? PaymentStatus.EXEMPT : PaymentStatus.PENDING;

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
    return this.toResponse(created);
  }

  async findByEvent(
    eventId: string,
    page: number,
    limit: number,
    user: JwtPayload,
  ): Promise<PaginatedResponse<EventPassengerResponse>> {
    const event = await this.prisma.client.event.findUnique({ where: { id: eventId } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    this.logger.debug(`Listando inscrições — eventId=${eventId}, page=${page}, limit=${limit}`);

    const isCongregationRole = !this.isCircuitRole(user.role);

    const where = {
      eventId,
      ...(isCongregationRole && user.congregationId ? { congregationId: user.congregationId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.eventPassenger.findMany({
        where,
        orderBy: { passenger: { name: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          passenger: true,
          eventPassengerDays: { include: { eventDay: true } },
        },
      }),
      this.prisma.client.eventPassenger.count({ where }),
    ]);

    return {
      data: data.map((ep) => this.toResponse(ep)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<EventPassengerResponse> {
    const ep = await this.prisma.client.eventPassenger.findUnique({
      where: { id },
      include: {
        passenger: true,
        eventPassengerDays: { include: { eventDay: true } },
      },
    });

    if (!ep) {
      this.logger.warn(`Inscrição não encontrada — id=${id}`);
      throw new NotFoundException('Inscrição não encontrada');
    }

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

    this.ensureEventOpen(ep.event.status);
    this.checkCongregationPermission(user, ep.congregationId);

    const activeDays = ep.event.eventDays.filter((d) => d.status === EventDayStatus.ACTIVE);
    const activeDayIds = new Set(activeDays.map((d) => d.id));
    const invalidDayId = dto.dayIds.find((dayId) => !activeDayIds.has(dayId));

    if (invalidDayId) {
      throw new UnprocessableEntityException(`Dia inválido ou cancelado: ${invalidDayId}`);
    }

    const newTotalAmount = Number(ep.event.ticketPrice) * dto.dayIds.length;
    const paidAmount = Number(ep.paidAmount);

    let newPaymentStatus: PaymentStatus;
    if (ep.paymentStatus === PaymentStatus.EXEMPT) {
      newPaymentStatus = PaymentStatus.EXEMPT;
    } else {
      newPaymentStatus = this.calculatePaymentStatus(paidAmount, newTotalAmount);
    }

    if (paidAmount > newTotalAmount && ep.paymentStatus !== PaymentStatus.EXEMPT) {
      this.logger.warn(
        `Crédito detectado após alteração de dias — id=${id}, paidAmount=${paidAmount}, newTotalAmount=${newTotalAmount}`,
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

    this.ensureEventOpen(ep.event.status);
    this.checkDeadlinePermission(ep.event.registrationDeadline, user.role);
    this.checkCongregationPermission(user, ep.congregationId);

    await this.prisma.client.eventPassenger.delete({ where: { id } });

    this.logger.warn(
      `Inscrição removida (hard-delete) — id=${id}, eventId=${ep.eventId}, passengerId=${ep.passengerId}`,
    );
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

  private async resolveInlinePassenger(
    user: JwtPayload,
    dto: CreateEventPassengerDto,
  ): Promise<{ passengerId: string; congregationId: string; rgHash: string }> {
    if (!this.isCircuitRole(user.role) && !user.congregationId) {
      throw new UnprocessableEntityException(
        'Roles de circuito sem congregação devem usar passengerId para inscrever passageiros',
      );
    }

    const congregationId = user.congregationId!;

    try {
      const created = await this.passengersService.create(congregationId, {
        name: dto.name!,
        rg: dto.rg!,
        phone: dto.phone,
      });

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

  private toResponse(ep: {
    id: string;
    totalAmount: unknown;
    paidAmount: unknown;
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
  }): EventPassengerResponse {
    return {
      id: ep.id,
      passenger: {
        id: ep.passenger.id,
        name: ep.passenger.name,
        rg: this.encryption.decrypt(ep.passenger.rgEncrypted),
        phone: ep.passenger.phone,
      },
      totalAmount: String(ep.totalAmount),
      paidAmount: String(ep.paidAmount),
      paymentStatus: ep.paymentStatus,
      exemptionReason: ep.exemptionReason,
      observations: ep.observations,
      eventId: ep.eventId,
      congregationId: ep.congregationId,
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

  private isCircuitRole(role: string): boolean {
    return role === 'CIRCUIT_COORDINATOR' || role === 'CIRCUIT_ASSISTANT';
  }

  private ensureEventOpen(status: string): void {
    if (status !== EventStatus.OPEN) {
      throw new UnprocessableEntityException(
        `Operação permitida apenas para eventos com status OPEN. Status atual: ${status}`,
      );
    }
  }

  private checkDeadlinePermission(registrationDeadline: Date, role: string): void {
    if (new Date() > registrationDeadline && !this.isCircuitRole(role)) {
      throw new UnprocessableEntityException('O prazo de inscrição expirou');
    }
  }

  private checkCongregationPermission(user: JwtPayload, congregationId: string): void {
    if (!this.isCircuitRole(user.role) && user.congregationId !== congregationId) {
      throw new ForbiddenException('Sem permissão para operar passageiros de outra congregação');
    }
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
}
