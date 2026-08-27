import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EventStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { EventLifecycleResult } from './interfaces/event-lifecycle-result.interface';

/**
 * Fuso usado para decidir qual e o "dia de hoje" ao comparar com as datas dos
 * dias do evento (armazenadas como `@db.Date`, ou seja, meia-noite UTC).
 */
const EVENT_TIMEZONE = 'America/Sao_Paulo';

/** Status a partir dos quais o job pode finalizar um evento automaticamente. */
const FINISHABLE_STATUSES: EventStatus[] = [EventStatus.OPEN, EventStatus.CLOSED];

interface EventSnapshot {
  id: string;
  title: string;
  status: EventStatus;
  circuitId: string;
}

/**
 * Transicoes automaticas do ciclo de vida do evento, executadas por cron:
 *
 * 1. `OPEN -> CLOSED` quando o prazo de inscricao (`registrationDeadline`) expira.
 * 2. `OPEN | CLOSED -> FINISHED` a partir do dia seguinte ao ultimo dia do evento.
 *
 * O passo 2 aceita `OPEN` como origem (diferente das transicoes manuais, que
 * exigem `CLOSED` antes) para que nenhum evento com data ja passada fique preso
 * em aberto caso o prazo de inscricao tenha sido configurado depois do evento.
 *
 * As transicoes usam `updateMany` com o status atual no `where`, o que as torna
 * idempotentes e seguras quando ha mais de uma instancia da aplicacao rodando.
 */
@Injectable()
export class EventLifecycleService {
  private readonly logger = new Logger(EventLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'event-lifecycle' })
  async handleCron(): Promise<void> {
    try {
      const result = await this.runAutoTransitions();
      this.logger.debug(
        `Ciclo de vida de eventos executado — encerrados=${result.closed}, finalizados=${result.finished}`,
      );
    } catch (err: unknown) {
      this.logger.error({ err }, 'Falha ao executar transicoes automaticas de eventos');
    }
  }

  /**
   * Aplica todas as transicoes automaticas pendentes.
   *
   * @param now Momento de referencia (injetavel para testes).
   */
  async runAutoTransitions(now: Date = new Date()): Promise<EventLifecycleResult> {
    const closed = await this.closeExpiredRegistrations(now);
    const finished = await this.finishPastEvents(now);

    return { closed, finished };
  }

  /** `OPEN -> CLOSED` para eventos cujo prazo de inscricao ja expirou. */
  private async closeExpiredRegistrations(now: Date): Promise<number> {
    const events = await this.prisma.client.event.findMany({
      where: { status: EventStatus.OPEN, registrationDeadline: { lt: now } },
      select: { id: true, title: true, status: true, circuitId: true },
    });

    return this.applyTransition(events, EventStatus.OPEN, EventStatus.CLOSED, 'REGISTRATION_DEADLINE_EXPIRED');
  }

  /** `OPEN | CLOSED -> FINISHED` para eventos cujo ultimo dia programado ja passou. */
  private async finishPastEvents(now: Date): Promise<number> {
    const todayStart = this.startOfTodayUtc(now);

    const events = await this.prisma.client.event.findMany({
      where: {
        status: { in: FINISHABLE_STATUSES },
        eventDays: { some: {} },
        NOT: { eventDays: { some: { date: { gte: todayStart } } } },
      },
      select: { id: true, title: true, status: true, circuitId: true },
    });

    return this.applyTransition(events, FINISHABLE_STATUSES, EventStatus.FINISHED, 'EVENT_DATE_PASSED');
  }

  /**
   * Atualiza o status dos eventos e grava o audit log correspondente na mesma
   * transacao. O `expectedStatus` no `where` evita sobrescrever um evento que
   * mudou de status entre a leitura e a escrita (ex: cancelado nesse intervalo).
   */
  private async applyTransition(
    events: EventSnapshot[],
    expectedStatus: EventStatus | EventStatus[],
    nextStatus: EventStatus,
    reason: string,
  ): Promise<number> {
    if (events.length === 0) {
      return 0;
    }

    const ids = events.map((e) => e.id);

    const [updated] = await this.prisma.client.$transaction([
      this.prisma.client.event.updateMany({
        where: {
          id: { in: ids },
          status: Array.isArray(expectedStatus) ? { in: expectedStatus } : expectedStatus,
        },
        data: { status: nextStatus },
      }),
      this.prisma.client.auditLog.createMany({
        data: events.map((event) =>
          this.auditLogService.buildCreateData('UPDATE', 'Event', event.id, null, {
            oldValues: { status: event.status },
            newValues: { status: nextStatus },
            actor: { type: 'SYSTEM', job: 'event-lifecycle', reason },
          }),
        ),
      }),
    ]);

    for (const event of events) {
      this.logger.log(
        `Status do evento alterado automaticamente — id=${event.id}, ${event.status} -> ${nextStatus}, ` +
          `motivo=${reason}, circuitId=${event.circuitId}`,
      );
    }

    return updated.count;
  }

  /**
   * Meia-noite (UTC) do dia corrente no fuso do evento.
   *
   * Como `EventDay.date` e uma coluna `date` (meia-noite UTC), comparar com esse
   * marco significa: um evento so e finalizado a partir do dia seguinte ao seu
   * ultimo dia programado.
   */
  private startOfTodayUtc(now: Date): Date {
    const isoDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: EVENT_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    return new Date(`${isoDate}T00:00:00.000Z`);
  }
}
