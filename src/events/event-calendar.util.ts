import type { Prisma } from '../generated/prisma/client';

/**
 * Fuso em que as datas do evento valem: o "dia de hoje" ao comparar com os dias
 * do evento (armazenados como `@db.Date`, ou seja, meia-noite UTC) e o dia em que
 * um prazo vence.
 */
export const EVENT_TIMEZONE = 'America/Sao_Paulo';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Diferenca, em minutos, entre o relogio de Sao Paulo e o UTC no instante dado: -180 hoje. */
function eventTimezoneOffsetMinutes(instant: Date): number {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIMEZONE, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset ?? '');

  if (!match) {
    return 0;
  }

  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);

  return sign === '-' ? -total : total;
}

/**
 * Primeiro instante de um dia de calendario ("2026-10-12") em Sao Paulo, em UTC.
 *
 * O offset e lido duas vezes porque, num dia de troca de horario de verao, o
 * offset da meia-noite UTC pode nao ser o da meia-noite local.
 */
function startOfDayInEventTimezone(isoDate: string): Date {
  const utcMidnight = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  const guess = utcMidnight - eventTimezoneOffsetMinutes(new Date(utcMidnight)) * MS_PER_MINUTE;

  return new Date(utcMidnight - eventTimezoneOffsetMinutes(new Date(guess)) * MS_PER_MINUTE);
}

/**
 * Ultimo instante de um dia de calendario em Sao Paulo, em UTC.
 *
 * Os prazos do evento (`registrationDeadline` e `paymentDeadline`) chegam como
 * data, sem hora ("2026-10-12"), e "inscricoes ate 12/10" vale ate o fim do dia
 * 12 em Sao Paulo: `2026-10-13T02:59:59.999Z`. Gravar `new Date('2026-10-12')`
 * daria a meia-noite UTC, 21h de 11/10 em Sao Paulo, e o prazo venceria na vespera.
 */
export function endOfDayInEventTimezone(isoDate: string): Date {
  const nextDay = new Date(new Date(`${isoDate}T00:00:00.000Z`).getTime() + MS_PER_DAY).toISOString().slice(0, 10);

  return new Date(startOfDayInEventTimezone(nextDay).getTime() - 1);
}

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
