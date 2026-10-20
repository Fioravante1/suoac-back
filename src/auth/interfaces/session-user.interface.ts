/**
 * Dados do usuário necessários para abrir uma sessão: o que entra no JWT mais o
 * que a resposta devolve ao cliente.
 *
 * Existe para que `issueSession` tenha uma assinatura só, em vez de repetir o
 * objeto inteiro em cada chamador — login, renovação, troca de senha e
 * autocadastro.
 */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  circuitId: string;
  congregationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
