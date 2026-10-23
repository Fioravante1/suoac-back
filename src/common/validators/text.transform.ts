/**
 * Transformer de DTO: apara os espaços das pontas de um texto.
 *
 * Valor que não é texto segue intacto, para a validação do DTO recusá-lo com a
 * mensagem certa em vez de o transformer lançar.
 */
export function toTrimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
