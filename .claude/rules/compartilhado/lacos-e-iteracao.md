---
trigger: model_decision
description: Quando criar ou editar código TypeScript/React (*.ts, *.tsx) que percorre, procura ou repete algo (preferir métodos de array e string a while/for com contador e let)
paths:
  - "**/*.{ts,tsx}"
---

# Laços e iteração

**Para percorrer, procurar ou transformar, use os métodos da linguagem — não um laço com contador.**
`while`, `do...while` e `for (;;)` com um índice que anda na mão e uma variável `let` mutada são o
jeito antigo de escrever isso: obrigam quem lê a simular a execução para descobrir o que o laço
devolve, e escondem a intenção (achar o último dígito, o primeiro item, o total) atrás da mecânica.

Prefira, nesta ordem:

1. **O método que já diz o que se quer**: `find`, `findLast`, `findIndex`, `findLastIndex`, `some`,
   `every`, `includes`, `indexOf`, `lastIndexOf`, `startsWith`/`endsWith`, `at`.
2. **Transformação declarativa**: `map`, `filter`, `flatMap`, `reduce`, `Object.entries`/`fromEntries`,
   `Array.from({ length: n }, …)` para gerar uma sequência.
3. **Expressão regular**, quando o alvo é um padrão em texto: `search`, `match`, `matchAll`, `replace`.
   Um `search(/\d/)` diz "o primeiro dígito" melhor que um índice andando até encontrar um.
4. **`for...of`**, quando for preciso sair cedo (`break`/`return`) ou `await` em sequência. Sem
   contador manual: `for (const [index, item] of items.entries())` se o índice for necessário.

```ts
// Errado — o índice anda na mão, e a variável muda até o laço acabar
let previous = start - 1;
while (previous >= 0 && !/\d/.test(value.charAt(previous))) previous -= 1;
const from = Math.max(0, previous);

// Correto — "o último dígito antes do cursor", em uma linha que se lê sozinha
const from = Math.max(value.slice(0, start).search(/\d\D*$/), 0);
```

```ts
// Errado — acumula numa variável mutável
const days: Date[] = [];
let current = startDate;
while (current <= endDate) {
  days.push(current);
  current = addDays(current, 1);
}

// Correto — a sequência é calculada, não acumulada
const totalDays = differenceInDays(endDate, startDate) + 1;
const days = Array.from({ length: totalDays }, (_, offset) => addDays(startDate, offset));
```

## Quando um `while` continua sendo o certo

Quando **não há como calcular de antemão quantas voltas** o laço dá, porque o fim depende de algo que
só se descobre rodando: consumir um cursor de paginação, repetir uma tentativa até ela passar, medir
um texto até caber numa largura. Nesses casos:

- nomeie a condição (`const doesNotFit = …`, `hasNextPage`) em vez de enfiar uma expressão longa no
  parêntese;
- use sempre chaves e escreva o corpo em linhas próprias — nunca `while (…) x += 1;` numa linha só;
- deixe um comentário dizendo por que não dá para calcular o número de voltas.

Antes de recorrer a isso, confirme que um método da lista acima não resolve. Na dúvida, não é caso de
`while`.

## O que não muda

Esta regra não vale para laços que já são declarativos (`for...of`, `forEach` sem estado externo).
Ela também não pede reescrever código existente que a contraria: ao tocar num arquivo, se houver um
laço que um método resolve, troque **naquele arquivo** junto com a mudança. Refatoração em massa
escondida num PR de funcionalidade torna a revisão impossível.
