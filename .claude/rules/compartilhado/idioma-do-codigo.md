---
trigger: model_decision
description: Quando criar ou editar arquivos de código (*.ts, *.tsx, *.js, *.mjs, *.cjs) ou prisma/schema.prisma (identificadores em inglês e textos para humanos em português)
paths:
  - "**/*.{ts,tsx}"
  - "**/*.{js,mjs,cjs}"
  - "prisma/schema.prisma"
---

# Idioma do código

**Identificadores são sempre em inglês**: classes, funções, métodos, variáveis, parâmetros, tipos,
propriedades de DTO, campos de schema, constantes e chaves de objeto.

O português fica para o que é lido por pessoas — comentários, textos de interface, mensagens de erro
da API, textos de log e descrições de teste (`describe`/`it`). Nunca misture os dois num mesmo
identificador.

```ts
// Correto
async function findOverduePayments(): Promise<PaymentResponse[]> {}
throw new NotFoundException("Passageiro não encontrado");
it("deve lançar 409 quando o RG já existe na congregação", () => {});

// Errado
async function buscarPagamentosVencidos(): Promise<RespostaPagamento[]> {}
const statusPagamento = "pago";
```

Arquivos e pastas usam `kebab-case`.
