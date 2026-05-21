import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateEventDayDto } from './dto/update-event-day.dto';
import type { EventDayResponse } from './interfaces/event-day-response.interface';

const EDITABLE_EVENT_STATUSES = ['DRAFT', 'OPEN'];

@Injectable()
export class EventDaysService {
  private readonly logger = new Logger(EventDaysService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByEvent(eventId: string): Promise<EventDayResponse[]> {
    await this.ensureEventExists(eventId);

    this.logger.debug(`Listando dias do evento — eventId=${eventId}`);

    const days = await this.prisma.client.eventDay.findMany({
      where: { eventId },
      orderBy: { dayNumber: 'asc' },
    });

    return days.map((d) => this.toResponse(d));
  }

  async findOne(id: string): Promise<EventDayResponse> {
    const day = await this.prisma.client.eventDay.findUnique({
      where: { id },
    });

    if (!day) {
      this.logger.warn(`Dia do evento não encontrado — id=${id}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    return this.toResponse(day);
  }

  async update(id: string, dto: UpdateEventDayDto): Promise<EventDayResponse> {
    const day = await this.prisma.client.eventDay.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!day) {
      this.logger.warn(`Dia do evento não encontrado — id=${id}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    if (!EDITABLE_EVENT_STATUSES.includes(day.event.status)) {
      throw new UnprocessableEntityException(
        `Não é possível editar dias de um evento com status ${day.event.status}`,
      );
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
    return this.toResponse(updated);
  }

  async cancel(id: string): Promise<EventDayResponse> {
    const day = await this.prisma.client.eventDay.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!day) {
      this.logger.warn(`Dia do evento não encontrado — id=${id}`);
      throw new NotFoundException('Dia do evento não encontrado');
    }

    if (!EDITABLE_EVENT_STATUSES.includes(day.event.status)) {
      throw new UnprocessableEntityException(
        `Não é possível cancelar dias de um evento com status ${day.event.status}`,
      );
    }

    if (day.status === 'CANCELLED') {
      this.logger.debug(`Dia do evento já cancelado (idempotente) — id=${id}`);
      return this.toResponse(day);
    }

    const updated = await this.prisma.client.eventDay.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`Dia do evento cancelado — id=${id}, eventId=${day.eventId}`);
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

  private async ensureEventExists(eventId: string): Promise<void> {
    const event = await this.prisma.client.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado ao validar dependência — eventId=${eventId}`);
      throw new NotFoundException('Evento não encontrado');
    }
  }
}
