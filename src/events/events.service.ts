import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { checkCircuitOwnership, isCircuitRole } from '../common/authorization/circuit-ownership.util';
import type { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import type { EventDayResponse } from '../event-days/interfaces/event-day-response.interface';
import type { Prisma } from '../generated/prisma/client';
import { EventStatus, EventType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEventDto } from './dto/create-event.dto';
import type { TransitionEventStatusDto } from './dto/transition-event-status.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import { notEndedEventWhere, startOfTodayInEventTimezone } from './event-calendar.util';
import type { EventResponse, EventWithDaysResponse } from './interfaces/event-response.interface';

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

/** Os dias do evento na ordem em que acontecem: detalhe, listagem e evento atual usam a mesma. */
const EVENT_DAYS_IN_ORDER = { eventDays: { orderBy: { dayNumber: 'asc' } } } satisfies Prisma.EventInclude;

/** Ordem dos passos da regra do evento atual: o primeiro status com candidato vence. */
const CURRENT_EVENT_STATUS_PRIORITY: readonly EventStatus[] = [EventStatus.OPEN, EventStatus.CLOSED, EventStatus.DRAFT];

interface CurrentEventCandidate {
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
  eventDays: Array<{ date: Date }>;
}

/** Evento sem dias vai para o fim da fila do seu passo. */
function firstDayTime(event: CurrentEventCandidate): number {
  if (event.eventDays.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.min(...event.eventDays.map((day) => day.date.getTime()));
}

/**
 * Ordena os candidatos pelos passos da regra: status na ordem de
 * `CURRENT_EVENT_STATUS_PRIORITY`; dentro de `OPEN` e `CLOSED`, o de primeiro dia
 * mais cedo; dentro de `DRAFT`, o atualizado por ultimo. O empate final pelo
 * criado por ultimo so existe para a resposta ser deterministica.
 */
function compareCurrentEventCandidates(a: CurrentEventCandidate, b: CurrentEventCandidate): number {
  const byStatus = CURRENT_EVENT_STATUS_PRIORITY.indexOf(a.status) - CURRENT_EVENT_STATUS_PRIORITY.indexOf(b.status);

  if (byStatus !== 0) {
    return byStatus;
  }

  const byStep =
    a.status === EventStatus.DRAFT ? b.updatedAt.getTime() - a.updatedAt.getTime() : firstDayTime(a) - firstDayTime(b);

  if (byStep !== 0) {
    return byStep;
  }

  return b.createdAt.getTime() - a.createdAt.getTime();
}

interface EventRecord {
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
}

interface EventDayRecord {
  id: string;
  dayNumber: number;
  date: Date;
  label: string;
  departureTime: string;
  returnTime: string;
  status: string;
  eventId: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(circuitId: string, user: JwtPayload, dto: CreateEventDto): Promise<EventWithDaysResponse> {
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
        createdById: user.sub,
        eventDays: {
          create: days,
        },
      },
      include: EVENT_DAYS_IN_ORDER,
    });

    this.logger.log(`Evento criado — id=${event.id}, title="${event.title}", circuitId=${circuitId}`);
    void this.auditLogService
      .log('CREATE', 'Event', event.id, user.sub, {
        oldValues: null,
        newValues: event as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: event.id }, 'Falha ao gravar audit log'));
    return this.toResponseWithDays(event);
  }

  async findByCircuit(
    circuitId: string,
    page: number,
    limit: number,
    user: JwtPayload,
    status?: EventStatus,
  ): Promise<PaginatedResponse<EventWithDaysResponse>> {
    await this.ensureCircuitExists(circuitId);

    this.logger.debug(`Listando eventos — circuitId=${circuitId}, page=${page}, limit=${limit}, role=${user.role}`);

    const isRestricted = !isCircuitRole(user.role);
    const where = {
      circuitId,
      ...(status ? { status } : isRestricted && { status: { not: EventStatus.DRAFT } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.event.findMany({
        where,
        include: EVENT_DAYS_IN_ORDER,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.event.count({ where }),
    ]);

    return {
      data: data.map((e) => this.toResponseWithDays(e)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Evento atual do circuito, pela regra do evento padrao do painel:
   *
   * 1. `OPEN`, o de primeiro dia mais cedo;
   * 2. `CLOSED` que ainda nao terminou (mesma condicao do `EventLifecycleService`),
   *    o de primeiro dia mais cedo;
   * 3. `DRAFT` atualizado por ultimo, so para os papeis do circuito;
   * 4. nenhum: `null`.
   *
   * `FINISHED` e `CANCELLED` nunca sao o evento atual: so ficam selecionados por
   * escolha explicita do usuario, que o front guarda.
   *
   * @param now Momento de referencia (injetavel para testes).
   */
  async findCurrent(
    circuitId: string,
    user: JwtPayload,
    now: Date = new Date(),
  ): Promise<EventWithDaysResponse | null> {
    await this.ensureCircuitExists(circuitId);

    const todayStart = startOfTodayInEventTimezone(now);
    const canSeeDrafts = isCircuitRole(user.role);

    const candidates = await this.prisma.client.event.findMany({
      where: {
        circuitId,
        OR: [
          { status: EventStatus.OPEN },
          { status: EventStatus.CLOSED, ...notEndedEventWhere(todayStart) },
          ...(canSeeDrafts ? [{ status: EventStatus.DRAFT }] : []),
        ],
      },
      include: EVENT_DAYS_IN_ORDER,
    });

    const [current] = [...candidates].sort(compareCurrentEventCandidates);

    this.logger.debug(
      `Evento atual — circuitId=${circuitId}, role=${user.role}, candidatos=${candidates.length}, ` +
        `eventId=${current?.id ?? 'nenhum'}`,
    );

    return current ? this.toResponseWithDays(current) : null;
  }

  async findOne(id: string, user: JwtPayload): Promise<EventWithDaysResponse> {
    const event = await this.prisma.client.event.findUnique({
      where: { id },
      include: EVENT_DAYS_IN_ORDER,
    });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

    if (!isCircuitRole(user.role) && event.status === EventStatus.DRAFT) {
      this.logger.warn(`Acesso negado: Evento em DRAFT — id=${id}, role=${user.role}`);
      throw new NotFoundException('Evento não encontrado');
    }

    return this.toResponseWithDays(event);
  }

  async update(id: string, dto: UpdateEventDto, user: JwtPayload): Promise<EventResponse> {
    const existing = await this.prisma.client.event.findUnique({ where: { id } });

    if (!existing) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, existing.circuitId);

    const allowedFields = EDITABLE_FIELDS_BY_STATUS[existing.status] ?? [];
    const sentFields = Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined);
    const forbiddenFields = sentFields.filter((f) => !allowedFields.includes(f));

    if (forbiddenFields.length > 0) {
      throw new UnprocessableEntityException(
        `Campos não editáveis no status ${existing.status}: ${forbiddenFields.join(', ')}`,
      );
    }

    const restrictions = ROLE_RESTRICTED_FIELDS[existing.status];
    const restrictedFields = restrictions
      ? sentFields.filter((f) => restrictions[f] && restrictions[f] !== user.role)
      : [];

    if (restrictedFields.length > 0) {
      throw new ForbiddenException(
        `Apenas ${restrictions![restrictedFields[0]!]!} pode editar: ${restrictedFields.join(', ')}`,
      );
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
    void this.auditLogService
      .log('UPDATE', 'Event', id, user.sub, {
        oldValues: existing as unknown as Record<string, unknown>,
        newValues: updated as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
    return this.toResponse(updated);
  }

  async transitionStatus(id: string, dto: TransitionEventStatusDto, user: JwtPayload): Promise<EventResponse> {
    const existing = await this.prisma.client.event.findUnique({
      where: { id },
      include: { eventDays: true },
    });

    if (!existing) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, existing.circuitId);

    const validNext = VALID_TRANSITIONS[existing.status] ?? [];
    if (!validNext.includes(dto.status)) {
      throw new UnprocessableEntityException(`Transição inválida: ${existing.status} → ${dto.status}`);
    }

    const isOpeningEvent = existing.status === EventStatus.DRAFT && dto.status === EventStatus.OPEN;
    const hasNoActiveDays = isOpeningEvent && existing.eventDays.every((d) => d.status !== 'ACTIVE');

    if (hasNoActiveDays) {
      throw new UnprocessableEntityException('O evento deve ter pelo menos 1 dia ativo para ser aberto');
    }

    const updated = await this.prisma.client.event.update({
      where: { id },
      data: { status: dto.status },
    });

    this.logger.log(`Status do evento alterado — id=${id}, ${existing.status} → ${dto.status}`);
    void this.auditLogService
      .log('UPDATE', 'Event', id, user.sub, {
        oldValues: { status: existing.status } as unknown as Record<string, unknown>,
        newValues: { status: updated.status } as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
    return this.toResponse(updated);
  }

  async remove(id: string, user: JwtPayload): Promise<void> {
    const existing = await this.prisma.client.event.findUnique({ where: { id } });

    if (!existing) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, existing.circuitId);

    if (existing.status !== EventStatus.DRAFT) {
      throw new UnprocessableEntityException('Apenas eventos em rascunho podem ser removidos');
    }

    await this.prisma.client.event.delete({ where: { id } });

    this.logger.warn(`Evento removido (hard-delete) — id=${id}`);
    void this.auditLogService
      .log('DELETE', 'Event', id, user.sub, {
        oldValues: existing as unknown as Record<string, unknown>,
        newValues: null,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
  }

  async cancel(id: string, user: JwtPayload): Promise<EventResponse> {
    const event = await this.prisma.client.event.findUnique({ where: { id } });

    if (!event) {
      this.logger.warn(`Evento não encontrado — id=${id}`);
      throw new NotFoundException('Evento não encontrado');
    }

    checkCircuitOwnership(user, event.circuitId);

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
    void this.auditLogService
      .log('UPDATE', 'Event', id, user.sub, {
        oldValues: { status: event.status } as unknown as Record<string, unknown>,
        newValues: { status: 'CANCELLED' } as unknown as Record<string, unknown>,
      })
      .catch((err: unknown) => this.logger.error({ err, entityId: id }, 'Falha ao gravar audit log'));
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

  private toResponse(event: EventRecord): EventResponse {
    return {
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
  }

  /** Recebe os dias ja na ordem de `EVENT_DAYS_IN_ORDER`. */
  private toResponseWithDays(event: EventRecord & { eventDays: EventDayRecord[] }): EventWithDaysResponse {
    return {
      ...this.toResponse(event),
      days: event.eventDays.map((day) => this.toDayResponse(day)),
    };
  }

  private toDayResponse(day: EventDayRecord): EventDayResponse {
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
