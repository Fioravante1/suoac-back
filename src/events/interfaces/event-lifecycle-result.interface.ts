/**
 * Resultado de uma execucao do job de ciclo de vida automatico de eventos.
 */
export interface EventLifecycleResult {
  /** Eventos movidos de OPEN para CLOSED por expiracao do prazo de inscricao. */
  closed: number;
  /** Eventos movidos para FINISHED por ja terem passado do ultimo dia programado. */
  finished: number;
}
