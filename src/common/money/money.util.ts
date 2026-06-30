/**
 * Tipo estrutural mínimo satisfeito tanto pelo `Decimal` do Prisma (decimal.js)
 * quanto por `number` nativo — ambos expõem `toFixed(digits): string`.
 */
export type MoneyLike = { toFixed: (digits: number) => string };

/**
 * Formata um valor monetário como string com 2 casas decimais (ex.: `"50.00"`).
 *
 * Usa o `.toFixed(2)` do próprio valor recebido — para o `Decimal` do Prisma isso
 * opera sobre a representação decimal exata, **sem converter para `number`**,
 * preservando a precisão exigida pelo código financeiro novo (AGENTS §3 / roadmap
 * financeiro). `null`/`undefined` (ex.: agregação sobre recorte vazio) → `"0.00"`.
 */
export function formatMoney(value: MoneyLike | null | undefined): string {
  return (value ?? 0).toFixed(2);
}

/**
 * Converte qualquer valor monetário para **centavos inteiros** (ex.: `"1500.00"` →
 * `150000`). Aceita `Decimal` do Prisma (via `toFixed(2)`) ou string `"NN.NN"`.
 * `null`/`undefined` → `0`. Opera em inteiros — sem aritmética de ponto flutuante
 * (`number`) que comprometeria a precisão monetária.
 */
function toCents(value: MoneyLike | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  // No máximo 2 casas decimais: rejeita (em vez de truncar silenciosamente) valores
  // como "1.999". Decimal/number entram via toFixed(2), então já vêm com 2 casas.
  const str = (typeof value === 'string' ? value : value.toFixed(2)).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(str);

  if (!match) {
    throw new Error(`Valor monetário inválido: "${str}"`);
  }

  const [, sign = '', intPart = '0', fracRaw = ''] = match;
  const frac = `${fracRaw}00`.slice(0, 2);
  const cents = Number.parseInt(intPart, 10) * 100 + Number.parseInt(frac, 10);
  return sign === '-' ? -cents : cents;
}

/** Formata centavos inteiros como string monetária `"NN.NN"` (ex.: `150000` → `"1500.00"`). */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const intPart = Math.floor(abs / 100);
  const fracPart = (abs % 100).toString().padStart(2, '0');
  return `${sign}${intPart}.${fracPart}`;
}

/**
 * Soma valores monetários com precisão exata (centavos inteiros), devolvendo a
 * string `"NN.NN"`. Aceita `Decimal` do Prisma, strings e `null`/`undefined` (→ 0).
 * Usar em todo cálculo monetário novo — **nunca** somar com `number`.
 */
export function addMoney(...values: Array<MoneyLike | string | null | undefined>): string {
  return formatCents(values.reduce<number>((sum, value) => sum + toCents(value), 0));
}

/**
 * Subtrai `b` de `a` com precisão exata (centavos inteiros), devolvendo `"NN.NN"`.
 * Resultado pode ser negativo (ex.: saldo deficitário). Aceita `Decimal`/string/null.
 */
export function subtractMoney(
  a: MoneyLike | string | null | undefined,
  b: MoneyLike | string | null | undefined,
): string {
  return formatCents(toCents(a) - toCents(b));
}

/**
 * Multiplica um valor monetário por um `factor` **inteiro não-negativo** (ex.: preço do
 * ingresso × nº de dias), com precisão exata em centavos, devolvendo `"NN.NN"`. `factor`
 * não-inteiro ou negativo lança erro (coerente com a validação estrita de {@link toCents}).
 */
export function multiplyMoney(value: MoneyLike | string | null | undefined, factor: number): string {
  if (!Number.isInteger(factor) || factor < 0) {
    throw new Error(`Fator inválido para multiplicação monetária: "${factor}" (esperado inteiro não-negativo)`);
  }
  return formatCents(toCents(value) * factor);
}

/**
 * Compara dois valores monetários por centavos inteiros (sem ponto flutuante).
 * Retorna `-1` se `a < b`, `1` se `a > b`, `0` se iguais. Substitui comparações diretas
 * (`<`, `>`, `<=`, `>=`) sobre dinheiro. Aceita `Decimal`/string/`null`/`undefined` (→ 0).
 */
export function compareMoney(
  a: MoneyLike | string | null | undefined,
  b: MoneyLike | string | null | undefined,
): -1 | 0 | 1 {
  const ca = toCents(a);
  const cb = toCents(b);
  if (ca < cb) {
    return -1;
  }
  if (ca > cb) {
    return 1;
  }
  return 0;
}

/**
 * Converte uma string monetária no formato `"NN.NN"` (saída de {@link formatMoney})
 * para o formato pt-BR de exibição (ex.: `"1500.00"` → `"1.500,00"`). Opera por
 * manipulação de string, sem converter para `number`, preservando a precisão já
 * fixada. Sem o prefixo `R$` — o chamador adiciona quando necessário.
 */
export function formatMoneyPtBR(value: string): string {
  const [intPartRaw = '0', decPartRaw = '00'] = value.split('.');
  const sign = intPartRaw.startsWith('-') ? '-' : '';
  const digits = sign ? intPartRaw.slice(1) : intPartRaw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decPart = decPartRaw.padEnd(2, '0').slice(0, 2);
  return `${sign}${grouped},${decPart}`;
}
