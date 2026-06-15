export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  circuitId: string;
  congregationId: string | null;
  /**
   * Opcional para compatibilidade com tokens emitidos antes da feature de troca
   * obrigatória. Ausência é tratada como `false` (sem troca pendente).
   */
  mustChangePassword?: boolean;
}
