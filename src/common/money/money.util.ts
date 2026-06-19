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
