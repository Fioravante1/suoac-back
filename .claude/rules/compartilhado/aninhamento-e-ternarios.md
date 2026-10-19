---
paths:
  - "**/*.{ts,tsx}"
---

# Aninhamento e ternários

**Nunca aninhe `if`s.** Use early returns (guard clauses), com condições combinadas quando couber.
Cada validação é um bloco independente no nível raiz da função.

```ts
// Errado
if (condA) {
  if (condB) {
    throw new Error("...");
  }
}

// Correto
if (condA && condB) {
  throw new Error("...");
}
```

**Ternário aninhado não entra no projeto.** Encadear `a ? x : b ? y : z` obriga quem lê a descartar
cada caso anterior para entender o próximo, e o último só se explica por eliminação. Ternário
simples, de duas alternativas claras, continua bem-vindo.

Fora de JSX, use early returns com cada caso nomeado:

```ts
// Errado
const status = payment.paidAt ? "PAID" : payment.dueDate < now ? "OVERDUE" : "PENDING";

// Correto
function resolvePaymentStatus(payment: Payment, now: Date): PaymentStatus {
  if (payment.paidAt) return "PAID";
  if (payment.dueDate < now) return "OVERDUE";
  return "PENDING";
}
```

Em JSX, nomeie cada estado e renderize com `&&` — cada condição responde por si e se lê
isoladamente. O exemplo em JSX está nas regras de estilo do frontend.
