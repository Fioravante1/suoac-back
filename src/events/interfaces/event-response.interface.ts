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
  days?: EventDayResponse[];
}
