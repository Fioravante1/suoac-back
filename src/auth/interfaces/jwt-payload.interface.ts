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
  /**
   * Versão da sessão no momento da emissão. O `JwtAuthGuard` compara com a
   * versão gravada no usuário e recusa o token quando ficou atrás — é assim que
   * a redefinição de senha derruba sessões já abertas.
   *
   * Opcional para não invalidar, no deploy, os tokens emitidos antes deste
   * campo existir: ausência é tratada como `0`.
   */
  sessionVersion?: number;
  /**
   * Sessão de "manter conectado". Espelha a marca do refresh token para que
   * `change-password`, que só vê o access token, reemita a sessão no mesmo modo.
   * Ausência é tratada como `false`.
   */
  extended?: boolean;
}
