/**
 * Representacao de um Passenger na API.
 * Usado como tipo de retorno nos controllers e services.
 * Nunca expoe rgEncrypted ou rgHash — apenas o rg descriptografado.
 */
export interface PassengerResponse {
  id: string;
  name: string;
  rg: string;
  phone: string | null;
  observations: string | null;
  congregationId: string;
  congregationName?: string;
  createdAt: Date;
  updatedAt: Date;
}
