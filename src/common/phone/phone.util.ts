/**
 * Aplica máscara a um número de telefone brasileiro, retornando sempre no
 * formato `11 97753-0630` (celular, 11 dígitos) ou `11 2555-7709`
 * (fixo, 10 dígitos).
 *
 * - Ignora qualquer caractere não numérico presente na entrada.
 * - Retorna `null` quando a entrada é `null`/`undefined`/vazia.
 * - Devolve o valor original quando não há 10 ou 11 dígitos (formato inesperado).
 */
export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, '');

  if (digits.length === 11) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return phone;
}
