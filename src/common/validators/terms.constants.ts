/**
 * Versão dos termos de uso aceita pela pessoa que se cadastra (SUC-85).
 *
 * A versão é a data da "Última atualização" da página `/termos`, em ISO
 * (`2026-10-25`). O DTO confere também que a data existe (`2026-02-30` é recusada). A API não guarda a lista das versões válidas: ela registra o
 * que o cliente diz ter exibido, e um cliente de um deploy diferente do da API
 * não pode ser recusado por isso.
 *
 * Opcional no contrato enquanto o front não a envia; vira obrigatória em card
 * próprio, depois que os dois lados estiverem em produção.
 */
export const TERMS_VERSION_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Formato certo e data que existe: `2026-02-30` e `9999-99-99` têm a forma, mas não são datas. */
export function isTermsVersion(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);

  return TERMS_VERSION_REGEX.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export const TERMS_VERSION_MESSAGE = 'A versão dos termos deve estar no formato AAAA-MM-DD';
