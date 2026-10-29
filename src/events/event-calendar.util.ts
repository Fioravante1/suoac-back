import type { Prisma } from '../generated/prisma/client';

/**
 * Fuso usado para decidir qual e o "dia de hoje" ao comparar com as datas dos
 * dias do evento (armazenadas como `@db.Date`, ou seja, meia-noite UTC).
 */
export const EVENT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Meia-noite (UTC) do dia corrente no fuso do evento.
 *
 * Como `EventDay.date` e uma coluna `date` (meia-noite UTC), comparar com esse
 * marco significa comparar dias de calendario em Sao Paulo: as 23h de 26/08 em
 * Sao Paulo (02h de 27/08 em UTC) ainda e o dia 26.
 */
export function startOfTodayInEventTimezone(now: Date): Date {
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return new Date(`${isoDate}T00:00:00.000Z`);
}

/**
 * Evento que ainda nao terminou: tem algum dia hoje ou depois.
 *
 * E a definicao unica de "ainda nao terminou". O ciclo de vida finaliza o que
 * nao atende a ela (`EventLifecycleService`), e o evento atual do circuito so
 * considera `CLOSED` que atende (`EventsService.findCurrent`). Mantendo uma so,
 * os dois nunca divergem sobre o mesmo evento.
 */
export function notEndedEventWhere(todayStart: Date): Prisma.EventWhereInput {
  return { eventDays: { some: { date: { gte: todayStart } } } };
}
