/**
 * Regra de celular compartilhada entre os DTOs que recebem o telefone de uma
 * pessoa que está se cadastrando (autocadastro do circuito e aceite de convite).
 *
 * O que chega é normalizado antes de validado: a máscara `(00) 00000-0000` é
 * apresentação, e o mesmo celular digitado com ou sem ela cai no mesmo valor.
 * Vale DDD mais 8 ou 9 dígitos.
 *
 * Não vale para o telefone de passageiro, que é opcional e aceita também fixo
 * (`@Length(8, 20)`, sem normalização).
 */
export const PHONE_DIGITS_REGEX = /^\d{10,11}$/;

export const PHONE_DIGITS_MESSAGE = 'O celular deve ter DDD e 8 ou 9 dígitos';

/** Só os dígitos de um texto: tira máscara, espaços e qualquer outro caractere. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Transformer de DTO: normaliza o celular para dígitos; valor que não é texto segue para a validação recusar. */
export function toPhoneDigits(value: unknown): unknown {
  return typeof value === 'string' ? onlyDigits(value) : value;
}
