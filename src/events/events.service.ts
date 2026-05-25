import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { EventDayResponse } from '../event-days/interfaces/event-day-response.interface';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { EventStatus, EventType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto } from './dto/create-event.dto';
import type { TransitionEventStatusDto } from './dto/transition-event-status.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import type { EventResponse } from './interfaces/event-response.interface';

const WEEKDAYS_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['CLOSED', 'CANCELLED'],
  CLOSED: ['FINISHED'],
  FINISHED: [],
  CANCELLED: [],
};

const EDITABLE_FIELDS_BY_STATUS: Record<string, string[]> = {
  DRAFT: [
    'title',
    'ticketPrice',
    'registrationDeadline',
    'paymentDeadline',
    'venue',
    'address',
    'city',
    'state',
    'observations',
  ],
  OPEN: [
    'title',
    'ticketPrice',
    'registrationDeadline',
    'paymentDeadline',
    'venue',
    'address',
    'city',
    'state',
    'observations',
  ],
  CLOSED: ['observations'],
  FINISHED: [],
  CANCELLED: [],
};

const ROLE_RESTRICTED_FIELDS: Record<string, Record<string, string>> = {
  OPEN: {
    registrationDeadline: 'CIRCUIT_COORDINATOR',
    paymentDeadline: 'CIRCUIT_COORDINATOR',
  },
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(circuitId: string, createdById: string, dto: CreateEventDto): Promise<EventResponse> {
    await this.ensureCircuitExists(circuitId);

    const startDate = new Date(`${dto.date}T00:00:00Z`);

    if (dto.type === EventType.REGIONAL_CONVENTION && !dto.endDate) {
      throw new UnprocessableEntityException('endDate é obrigatório para congressos regionais');
    }

    if (dto.type === EventType.REGIONAL_CONVENTION && dto.endDate && new Date(`${dto.endDate}T00:00:00Z`) < startDate) {
      throw new UnprocessableEntityException('endDate deve ser maior ou igual a date');
    }

    const days = this.generateDays(dto);

    const event = await this.prisma.client.event.create({
      data: {
        title: dto.title,
        type: dto.type,
        ticketPrice: dto.ticketPrice,
        status: 'DRAFT',
        registrationDeadline: new Date(dto.registrationDeadline),
        paymentDeadline: new Date(dto.paymentDeadline),
        venue: dto.venue,
        address: dto.address,
        city: dto.city,
        state: dto.state.toUpperCase(),
        observations: dto.observations ?? null,
        circuitId,
        createdById,
        eventDays: {
          create: days,
        },
      },
      include: { eventDays: { orderBy: { dayNumber: 'asc' } } },
    });

    this.logger.log(`Evento criado — id=${event.id}, title="${event.title}", circuitId=${circuitId}`);
    return this.toResponse(event, true);
  }

  async findByCircuit(
    circuitId: string,
    page: number,
    limit: number,
    role: string,
  ): Promise<PaginatedResponse<EventResponse>> {
    await this.ensureCircuitExists(circuitId);

    this.logger.debug(`Listando eventos — circuitId=${circuitId}, page=${page}, limit=${limit}, role=${role}`);

    const isRestricted = role === 'CONGREGATION_COORDINATOR' || role === 'CONGREGATION_ASSISTANT';
    const where = {
      circuitId,
      ...(isRestricted && { status: { not: EventStatus.DRAFT } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.event.count({ where }),
    ]);

    return {
      data: data.map((e) => this.toResponse(e)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, role: string): Promise<EventResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id },
      include: { eventDays: { orderBy: { dayNumber: 'asc' } } },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    const isRestricted = role === 'CONGREGATION_COORDINATOR' || role === 'CONGREGATION_ASSISTANT';
    if (isRestricted && event.status === EventStatus.DRAFT) {
      this.logger.warn(`Acesso negado: Evento em DRAFT — id=${id}, role=${role}`);
      throw new NotFoundException('Evento não encontrado');
    }

    return this.toResponse(event, true);
  }

  async update(id: string, dto: UpdateEventDto, role: string): Promise<EventResponse> {
    const event = await this.prisma.client.event.findUnique({ where: { id } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    const allowedFields = EDITABLE_FIELDS_BY_STATUS[event.status] ?? [];
    const sentFields = Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined);
    const forbiddenFields = sentFields.filter((f) => !allowedFields.includes(f));

    if (forbiddenFields.length > 0) {
      throw new UnprocessableEntityException(
        `Campos não editáveis no status ${event.status}: ${forbiddenFields.join(', ')}`,
      );
    }

    const restrictions = ROLE_RESTRICTED_FIELDS[event.status];
    if (restrictions) {
      const restrictedFields = sentFields.filter((f) => restrictions[f] && restrictions[f] !== role);
      if (restrictedFields.length > 0) {
        throw new ForbiddenException(
          `Apenas ${restrictions[restrictedFields[0]!]!} pode editar: ${restrictedFields.join(', ')}`,
        );
      }
    }

    const updated = await this.prisma.client.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.ticketPrice !== undefined && { ticketPrice: dto.ticketPrice }),
        ...(dto.registrationDeadline !== undefined && { registrationDeadline: new Date(dto.registrationDeadline) }),
        ...(dto.paymentDeadline !== undefined && { paymentDeadline: new Date(dto.paymentDeadline) }),
        ...(dto.venue !== undefined && { venue: dto.venue }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state.toUpperCase() }),
        ...(dto.observations !== undefined && { observations: dto.observations }),
      },
    });

    this.logger.log(`Evento atualizado — id=${id}`);
    return this.toResponse(updated);
  }

  async transitionStatus(id: string, dto: TransitionEventStatusDto): Promise<EventResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id },
      include: { eventDays: true },
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    const validNext = VALID_TRANSITIONS[event.status] ?? [];
    if (!validNext.includes(dto.status)) {
      throw new UnprocessableEntityException(`Transição inválida: ${event.status} → ${dto.status}`);
    }

    const isOpeningEvent = event.status === EventStatus.DRAFT && dto.status === EventStatus.OPEN;
    const hasNoActiveDays = isOpeningEvent && event.eventDays.every((d) => d.status !== 'ACTIVE');

    if (hasNoActiveDays) {
      throw new UnprocessableEntityException('O evento deve ter pelo menos 1 dia ativo para ser aberto');
    }

    const updated = await this.prisma.client.event.update({
      where: { id },
      data: { status: dto.status },
    });

    this.logger.log(`Status do evento alterado — id=${id}, ${event.status} → ${dto.status}`);
    return this.toResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const event = await this.prisma.client.event.findUnique({ where: { id } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    if (event.status !== EventStatus.DRAFT) {
      throw new UnprocessableEntityException('Apenas eventos em rascunho podem ser removidos');
    }

    await this.prisma.client.event.delete({ where: { id } });

    this.logger.warn(`Evento removido (hard-delete) — id=${id}`);
  }

  async cancel(id: string): Promise<EventResponse> {
    const event = await this.prisma.client.event.findUnique({ where: { id } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    if (event.status === EventStatus.CANCELLED) {
      this.logger.debug(`Evento já cancelado (idempotente) — id=${id}`);
      return this.toResponse(event);
    }

    if (event.status !== EventStatus.OPEN) {
      throw new UnprocessableEntityException(
        `Apenas eventos em OPEN podem ser cancelados. Status atual: ${event.status}`,
      );
    }

    const [updatedEvent] = await this.prisma.client.$transaction([
      this.prisma.client.event.update({
        where: { id },
        data: { status: 'CANCELLED' },
      }),
      this.prisma.client.eventDay.updateMany({
        where: { eventId: id, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      }),
      this.prisma.client.congregationEventStatus.updateMany({
        where: { eventId: id },
        data: { status: 'PENDING', finalizedById: null, finalizedAt: null },
      }),
    ]);

    this.logger.log(`Evento cancelado — id=${id}. Dias ativos, status de congregações resetados`);
    return this.toResponse(updatedEvent);
  }

  private generateDays(dto: CreateEventDto): Array<{
    dayNumber: number;
    date: Date;
    label: string;
    departureTime: string;
    returnTime: string;
  }> {
    const days: Array<{
      dayNumber: number;
      date: Date;
      label: string;
      departureTime: string;
      returnTime: string;
    }> = [];

    const startDate = new Date(`${dto.date}T00:00:00Z`);

    if (dto.type === EventType.ASSEMBLY) {
      const weekday = WEEKDAYS_PT[startDate.getUTCDay()]!;
      days.push({
        dayNumber: 1,
        date: startDate,
        label: `Dia 1 - ${weekday}`,
        departureTime: dto.departureTime,
        returnTime: dto.returnTime,
      });
    } else {
      const endDate = new Date(`${dto.endDate!}T00:00:00Z`);
      let dayNumber = 1;
      const current = new Date(startDate);

      while (current <= endDate) {
        const weekday = WEEKDAYS_PT[current.getUTCDay()]!;
        days.push({
          dayNumber,
          date: new Date(current),
          label: `Dia ${dayNumber} - ${weekday}`,
          departureTime: dto.departureTime,
          returnTime: dto.returnTime,
        });
        dayNumber++;
        current.setUTCDate(current.getUTCDate() + 1);
      }
    }

    return days;
  }

  private toResponse(
    event: {
      id: string;
      title: string;
      type: string;
      ticketPrice: unknown;
      status: string;
      registrationDeadline: Date;
      paymentDeadline: Date;
      venue: string;
      address: string;
      city: string;
      state: string;
      observations: string | null;
      circuitId: string;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
      eventDays?: Array<{
        id: string;
        dayNumber: number;
        date: Date;
        label: string;
        departureTime: string;
        returnTime: string;
        status: string;
        eventId: string;
      }>;
    },
    includeDays = false,
  ): EventResponse {
    const response: EventResponse = {
      id: event.id,
      title: event.title,
      type: event.type,
      ticketPrice: String(event.ticketPrice),
      status: event.status,
      registrationDeadline: event.registrationDeadline,
      paymentDeadline: event.paymentDeadline,
      venue: event.venue,
      address: event.address,
      city: event.city,
      state: event.state,
      observations: event.observations,
      circuitId: event.circuitId,
      createdById: event.createdById,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };

    if (includeDays && event.eventDays) {
      response.days = event.eventDays.map((d) => this.toDayResponse(d));
    }

    return response;
  }

  private toDayResponse(day: {
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

  private async ensureCircuitExists(circuitId: string): Promise<void> {
    const circuit = await this.prisma.client.circuit.findUnique({
      where: { id: circuitId },
    });

    if (!circuit) {
      this.logger.warn(`Circuito não encontrado ao validar dependência — circuitId=${circuitId}`);
      throw new NotFoundException('Circuito não encontrado');
    }
  }
}
