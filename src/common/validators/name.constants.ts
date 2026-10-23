import { toTrimmed } from './text.transform';

/**
 * Regra de nome de pessoa compartilhada entre os DTOs de quem se cadastra.
 *
 * Só o que é igual em todos os fluxos mora aqui: o comprimento. O corte dos
 * espaços das pontas é `toTrimmed`. A exigência de nome e sobrenome e o colapso de espaços
 * internos valem apenas onde o fluxo os pede (hoje, o aceite de convite); o
 * autocadastro do circuito não exige sobrenome, e mudar isso é decisão de produto.
 */
export const PERSON_NAME_LENGTH = { MIN: 2, MAX: 150 } as const;

/** Como `toTrimmed`, e também reduz qualquer sequência de espaços internos a um só. */
export function toCollapsedName(value: unknown): unknown {
  const trimmed = toTrimmed(value);

  return typeof trimmed === 'string' ? trimmed.replace(/\s+/g, ' ') : trimmed;
}

/** Ao menos duas palavras, separadas por qualquer sequência de espaços. */
export const FULL_NAME_REGEX = /^\S+(\s+\S+)+$/;

export const FULL_NAME_MESSAGE = 'Informe nome e sobrenome';
