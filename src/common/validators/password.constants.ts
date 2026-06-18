/**
 * Política de complexidade de senha compartilhada entre os DTOs que definem
 * senha (criação de usuário, reset por admin e troca de senha pelo próprio usuário).
 *
 * Exige ao menos uma letra minúscula, uma maiúscula e um número. O comprimento
 * mínimo continua sendo controlado por `@Length` em cada DTO.
 */
export const PASSWORD_COMPLEXITY_REGEX = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

export const PASSWORD_COMPLEXITY_MESSAGE =
  'A senha deve conter ao menos uma letra maiúscula, uma minúscula e um número';
