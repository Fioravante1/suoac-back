/**
 * Representação de uma Congregation na API.
 * Usado como tipo de retorno nos controllers e services.
 */
export interface CongregationResponse {
  id: string;
  code: string;
  name: string;
  /**
   * Nulo nas congregações criadas pelo autocadastro de circuito (SUC-37), que
   * coleta apenas nome e código — o coordenador não tem como saber o e-mail de
   * cada congregação na hora do cadastro.
   */
  email: string | null;
  city: string | null;
  circuitId: string;
  createdAt: Date;
  updatedAt: Date;
}
