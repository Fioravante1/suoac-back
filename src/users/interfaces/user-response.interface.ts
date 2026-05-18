/**
 * Representacao de um User na API.
 * Usado como tipo de retorno nos controllers e services.
 * passwordHash deliberadamente omitido.
 */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  circuitId: string;
  congregationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
