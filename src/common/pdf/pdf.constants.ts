/**
 * Teto defensivo de passageiros por exportação de PDF sem paginação.
 * Acima deste limite, o export é bloqueado com 422 e o usuário é orientado
 * a filtrar por congregação. Volume esperado por evento: 200–800 inscritos.
 */
export const PDF_EXPORT_MAX_PASSENGERS = 2000;
