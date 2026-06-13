/**
 * Representação de uma Congregation na API.
 * Usado como tipo de retorno nos controllers e services.
 */
export interface CongregationResponse {
  id: string;
  code: string;
  name: string;
  email: string;
  city: string | null;
  circuitId: string;
  createdAt: Date;
  updatedAt: Date;
}
