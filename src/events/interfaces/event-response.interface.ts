import type { EventDayResponse } from '../../event-days/interfaces/event-day-response.interface';

/**
 * Representacao de um Event na API.
 * Usado como tipo de retorno nos controllers e services.
 */
export interface EventResponse {
  id: string;
  title: string;
  type: string;
  ticketPrice: string;
  status: string;
  /** Último instante do dia do prazo em São Paulo: "até 12/10" é `2026-10-13T02:59:59.999Z`. */
  registrationDeadline: Date;
  /** Mesma regra de `registrationDeadline`. */
  paymentDeadline: Date;
  /** Quando as inscrições abriram (a publicação do rascunho); `null` em rascunho e em evento antigo sem registro. */
  publishedAt: Date | null;
  /**
   * Quando as inscrições encerraram: o encerramento manual ou, pelo ciclo de vida, o próprio prazo.
   * `null` enquanto estão abertas e em evento antigo sem registro.
   */
  registrationClosedAt: Date | null;
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

/**
 * Event com os dias, ordenados por `dayNumber`. E o formato do detalhe, da listagem
 * do circuito e do evento atual: o tipo obriga quem os devolve a carregar os dias.
 */
export interface EventWithDaysResponse extends EventResponse {
  days: EventDayResponse[];
}
