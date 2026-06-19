/**
 * Tipo estrutural mínimo satisfeito tanto pelo `Decimal` do Prisma (decimal.js)
 * quanto por `number` nativo — ambos expõem `toFixed(digits): string`.
 */
type MoneyLike = { toFixed: (digits: number) => string };

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
