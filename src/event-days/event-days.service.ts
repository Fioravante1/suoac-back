import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateEventDayDto } from './dto/update-event-day.dto';
import type { EventDayResponse } from './interfaces/event-day-response.interface';

const EDITABLE_EVENT_STATUSES = ['DRAFT', 'OPEN'];

@Injectable()
export class EventDaysService {
  private readonly logger = new Logger(EventDaysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findByEvent(eventId: string, user: JwtPayload): Promise<EventDayResponse[]> {
    const event = await this.ensureEventExists(eventId, user);

    if (!isCircuitRole(user.role) && event.status === 'DRAFT') {
      this.logger.warn(`Acesso negado: Evento em DRAFT — eventId=${eventId}, role=${user.role}`);
      throw new NotFoundException('Evento não encontrado');
    }

    this.logger.debug(`Listando dias do evento — eventId=${eventId}`);

    const days = await this.prisma.client.eventDay.findMany({
      where: { eventId },
      orderBy: { dayNumber: 'asc' },
    });

    return days.map((d) => this.toResponse(d));
  }

  async findOne(id: string, user: JwtPayload): Promise<EventDayResponse> {
    const day = await this.prisma.client.eventDay.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!day) {
      this.logger.warn(`Dia do evento não encontrado — id=${id}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    checkCircuitOwnership(user, day.event.circuitId);

    if (!isCircuitRole(user.role) && day.event.status === 'DRAFT') {
      this.logger.warn(`Acesso negado: Evento em DRAFT — id=${id}, eventId=${day.eventId}, role=${user.role}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    return this.toResponse(day);
  }

  async update(id: string, dto: UpdateEventDayDto, user: JwtPayload): Promise<EventDayResponse> {
    const day = await this.prisma.client.eventDay.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!day) {
      this.logger.warn(`Dia do evento não encontrado — id=${id}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    checkCircuitOwnership(user, day.event.circuitId);

    if (!EDITABLE_EVENT_STATUSES.includes(day.event.status)) {
      throw new UnprocessableEntityException(`Não é possível editar dias de um evento com status ${day.event.status}`);
    }

    if (day.status === 'CANCELLED') {
      throw new UnprocessableEntityException('Não é possível editar um dia cancelado');
    }

    const updated = await this.prisma.client.eventDay.update({
      where: { id },
      data: {
        ...(dto.departureTime !== undefined && { departureTime: dto.departureTime }),
        ...(dto.returnTime !== undefined && { returnTime: dto.returnTime }),
      },
    });

    this.logger.log(`Dia do evento atualizado — id=${id}, eventId=${day.eventId}`);

    void this.auditLogService
      .log('UPDATE', 'EventDay', id, user.sub, {
        oldValues: day as unknown as Record<string, unknown>,
        newValues: updated as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));

    return this.toResponse(updated);
  }

  async cancel(id: string, user: JwtPayload): Promise<EventDayResponse> {
    const day = await this.prisma.client.eventDay.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!day) {
      this.logger.warn(`Dia do evento não encontrado — id=${id}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    checkCircuitOwnership(user, day.event.circuitId);

    if (!EDITABLE_EVENT_STATUSES.includes(day.event.status)) {
      throw new UnprocessableEntityException(
        `Não é possível cancelar dias de um evento com status ${day.event.status}`,
      );
    }

    if (day.status === 'CANCELLED') {
      this.logger.debug(`Dia do evento já cancelado (idempotente) — id=${id}`);
      return this.toResponse(day);
    }

    const activeDaysCount = await this.prisma.client.eventDay.count({
      where: { eventId: day.eventId, status: 'ACTIVE' },
    });

    if (activeDaysCount <= 1) {
      const [updatedDay] = await this.prisma.client.$transaction([
        this.prisma.client.eventDay.update({
          where: { id },
          data: { status: 'CANCELLED' },
        }),
        this.prisma.client.event.update({
          where: { id: day.eventId },
          data: { status: 'CANCELLED' },
        }),
        this.prisma.client.congregationEventStatus.updateMany({
          where: { eventId: day.eventId },
          data: { status: 'PENDING', finalizedById: null, finalizedAt: null },
        }),
      ]);

      this.logger.log(
        `Último dia ativo cancelado — id=${id}, eventId=${day.eventId}. Evento transicionado para CANCELLED, status de congregações resetados`,
      );

      void this.auditLogService
        .log('UPDATE', 'EventDay', id, user.sub, {
          oldValues: { status: day.status } as unknown as Record<string, unknown>,
          newValues: { status: 'CANCELLED' } as unknown as Record<string, unknown>,
        })
        .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));

      return this.toResponse(updatedDay);
    }

    const updated = await this.prisma.client.eventDay.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`Dia do evento cancelado — id=${id}, eventId=${day.eventId}`);

    void this.auditLogService
      .log('UPDATE', 'EventDay', id, user.sub, {
        oldValues: { status: day.status } as unknown as Record<string, unknown>,
        newValues: { status: 'CANCELLED' } as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));

    return this.toResponse(updated);
  }

  private toResponse(day: {
    id: string;
    dayNumber: number;
    date: Date;
    label: string;
    departureTime: string;
    returnTime: string;
    status: string;
    eventId: string;
  }): EventDayResponse {
    return {
      id: day.id,
      dayNumber: day.dayNumber,
      date: day.date,
      label: day.label,
      departureTime: day.departureTime,
      returnTime: day.returnTime,
      status: day.status,
      eventId: day.eventId,
    };
  }

  private async ensureEventExists(
    eventId: string,
    user: JwtPayload,
  ): Promise<{ id: string; status: string; circuitId: string }> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, circuitId: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado ao validar dependência — eventId=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    return event;
  }
}
