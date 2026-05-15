/**
 * Representação de um Circuit na API.
 * Usado como tipo de retorno nos controllers e services.
 */
export interface CircuitResponse {
  id: string;
  name: string;
  city: string;
  state: string;
  createdAt: Date;
  updatedAt: Date;
}
