/**
 * Forma única de um e-mail dentro do sistema: sem espaços nas pontas e em
 * minúsculas. `User.email` é `@unique`, e a unicidade do Postgres diferencia
 * maiúsculas, então "Fulano@x.com" e "fulano@x.com" seriam duas contas. O banco
 * recusa e-mail fora dessa forma (`users_email_lowercase_check`), e toda busca
 * por e-mail passa por aqui antes, para usar o índice `users_email_key` por
 * igualdade em vez de varrer a tabela.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Transformer de DTO: normaliza o e-mail; valor que não é texto segue para a validação recusar. */
export function toNormalizedEmail(value: unknown): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}
