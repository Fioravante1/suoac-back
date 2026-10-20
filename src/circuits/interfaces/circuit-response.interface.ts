/**
 * Representação de um Circuit na API.
 * Usado como tipo de retorno nos controllers e services.
 */
export interface CircuitResponse {
  id: string;
  /**
   * Código curto do circuito (`SP-17`). Nulo nos circuitos criados antes do
   * autocadastro (SUC-37) — ver SUC-60, que fecha o campo como obrigatório.
   */
  code: string | null;
  name: string;
  city: string;
  state: string;
  createdAt: Date;
  updatedAt: Date;
}
