import { EventType } from '../generated/prisma/enums';

const MS_PER_DAY = 86_400_000;

/**
 * Teto de dias de um evento do tipo Outro. Cobre retiro e fim de semana com folga; acima
 * disso quase sempre é ano digitado errado, e cada dia vira uma linha em `event_days`.
 */
export const MAX_OTHER_EVENT_DAYS = 7;

/**
 * Prefixo do tipo no título dos PDFs e do recibo ("Congresso Felicidade Eterna"). O título de
 * Outro é livre, então não leva prefixo: "Evento Evento de Jovens" repetiria a palavra.
 */
const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EventType.ASSEMBLY]: 'Assembleia',
  [EventType.REGIONAL_CONVENTION]: 'Congresso',
  [EventType.OTHER]: '',
};

export function getEventTypeLabel(type: EventType): string {
  return EVENT_TYPE_LABELS[type];
}

/** Título do evento com o prefixo do tipo, sem espaço sobrando quando o tipo não tem prefixo. */
export function composeEventTitle(type: EventType, title: string): string {
  return [getEventTypeLabel(type), title].filter(Boolean).join(' ');
}

/** Assembleia é sempre de 1 dia e ignora `endDate`; os demais tipos usam o intervalo. */
export function usesEndDate(type: EventType): boolean {
  return type !== EventType.ASSEMBLY;
}

/** Só o congresso regional exige `endDate`; em Outro ele é opcional (sem ele, 1 dia). */
export function requiresEndDate(type: EventType): boolean {
  return type === EventType.REGIONAL_CONVENTION;
}

/** Data (meia-noite UTC, como o `@db.Date` guarda) do dia `offset` depois de `date`, AAAA-MM-DD. */
export function addEventDays(date: string, offset: number): Date {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + offset * MS_PER_DAY);
}

/** Quantidade de dias do evento, contando o primeiro e o último. Datas no formato AAAA-MM-DD. */
export function countEventDays(type: EventType, date: string, endDate?: string | null): number {
  if (!usesEndDate(type) || !endDate) {
    return 1;
  }

  const span = new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime();

  return Math.round(span / MS_PER_DAY) + 1;
}
