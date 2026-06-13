/**
 * Representacao de um EventDay na API.
 * Usado como tipo de retorno nos controllers e services.
 */
export interface EventDayResponse {
  id: string;
  dayNumber: number;
  date: Date;
  label: string;
  departureTime: string;
  returnTime: string;
  status: string;
  eventId: string;
}
