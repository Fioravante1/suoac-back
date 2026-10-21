---
trigger: model_decision
description: Quando criar ou editar testes unitários ou E2E com Jest em **/*.spec.ts, **/*.e2e-spec.ts ou test/**
paths:
  - "**/*.spec.ts"
  - "**/*.e2e-spec.ts"
  - "test/**"
---

# Testes

O projeto utiliza **Jest** como framework de testes. Todo código de negócio implementado **DEVE** ter testes correspondentes. A ausência de testes é considerada *technical debt* e não será aceita.

### Pirâmide de Testes

| Camada | Proporção | Escopo | Banco de Dados |
|---|---|---|---|
| **Unit** | Maioria (~70%) | Service/UseCase isolado, lógica pura | Mockado |
| **Integration** | Moderado (~20%) | Módulo + dependências internas | Mockado |
| **E2E** | Poucos (~10%) | Fluxo HTTP completo (request → response) | Real (Docker) |

### Testes Unitários (`.spec.ts`)

Testes unitários verificam a **lógica de negócio isolada**. Todas as dependências externas (Prisma, APIs, etc.) devem ser mockadas.

- **Localização:** No mesmo diretório do arquivo testado (ex: `users.service.spec.ts` ao lado de `users.service.ts`).
- **Mock do Prisma:** Utilize `jest-mock-extended` para criar mocks tipados do `PrismaService`. Nunca conecte ao banco real em testes unitários.
  ```typescript
  import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
  import type { PrismaClient } from '../generated/prisma/client';

  const prismaMock = mockDeep<PrismaClient>();

  // No TestingModule:
  { provide: PrismaService, useValue: { client: prismaMock } }
  ```
- **Foco:** Testar transformações de dados, validações, regras de negócio, tratamento de erros. Não testar queries do Prisma em si.
- **Padrão de nomeação:**
  ```typescript
  describe('UsersService', () => {
    describe('create', () => {
      it('deve criar um usuário com os dados válidos', async () => { ... });
      it('deve lançar ConflictException quando o email já existe', async () => { ... });
    });
  });
  ```

### Testes E2E (`.e2e-spec.ts`)

Testes end-to-end verificam o **fluxo completo** da aplicação: HTTP request → Controller → Service → Banco → Response.

- **Localização:** Pasta `test/` na raiz do projeto.
- **Banco de dados:** Utilizar um banco de dados real via Docker (isolado do dev). Nunca usar o banco de desenvolvimento.
- **Limpeza:** Sempre limpar o estado do banco entre os testes (`afterEach` ou `afterAll`) para evitar poluição entre suítes.
- **Execução:** Rodar com `--runInBand` para evitar race conditions e esgotamento do pool de conexões.
- **Escopo:** Limitar E2E aos fluxos críticos: autenticação, CRUD principal, fluxos de pagamento. Lógica complexa deve ser coberta por testes unitários.

### Repetição em testes: o que extrair e o que manter

Teste não segue DRY da mesma forma que código de produção. O corpo de um teste precisa contar a
história inteira — quem lê tem que entender o caso sem pular para outro arquivo. Extrair demais
produz testes que passam, falham e ninguém sabe por quê.

**Extraia** o setup mecânico que se repete entre arquivos e não diz nada sobre o caso: a montagem do
`TestingModule` com os mesmos providers, o mock do `PrismaService`, stubs de relógio e limpeza de
estado global.

**Mantenha no teste** o que dá sentido ao caso: o cenário sendo montado, os dados relevantes e todos
os `expect`. Se o nome do teste diz "quando o passageiro pertence a outro circuito", a linha que
coloca o passageiro em outro circuito pertence ao teste, não ao helper.

**Não crie** helper que monta cenário inteiro (`setupTudo()`), nem helper usado por um único arquivo
— nesse caso a função factory local no próprio `.spec.ts` já resolve, e é o padrão atual do projeto
(ex: `buildPrismaPassenger()` em `passengers.service.spec.ts`).

Antes de extrair um helper compartilhado, confirme que há **pelo menos dois** arquivos que o usam de
verdade. Helpers compartilhados ficam em um módulo `*-testing/` dentro do domínio a que pertencem,
ou em `test/support/` quando atravessarem domínios — nunca exportados pelo módulo NestJS nem pelas
interfaces públicas, e excluídos da cobertura por não serem código de produção.

**Este padrão é obrigatório para todo teste novo.** Os testes existentes migram pela regra do
escoteiro: ao tocar num `.spec.ts`, se houver duplicação que o padrão resolve, migre **aquele
arquivo** junto com a mudança. Não faça mutirão de migração nem migre arquivo que você não precisou
tocar — refatoração ampla escondida dentro de um PR de funcionalidade torna a revisão impossível. Se
a migração de um arquivo competir em tamanho com o trabalho da vez, ela vira card próprio.

### Regras Gerais

- **Nunca ignore testes falhando:** Testes quebrando devem ser corrigidos, não desabilitados com `.skip`.
- **Test data factories:** Use funções factory para criar dados de teste dinâmicos. Evitar fixtures estáticas com dados hardcoded.
- **Uma asserção por conceito:** Cada `it()` deve testar uma única coisa. Múltiplas asserções são aceitáveis apenas quando verificam aspectos do mesmo resultado.
- **Nomenclatura descritiva:** Os nomes dos testes devem descrever o comportamento esperado em português (ex: `'deve retornar 404 quando o passageiro não existe'`).

### Scripts

```bash
npm run test           # Testes unitários
npm run test:watch     # Watch mode (desenvolvimento)
npm run test:cov       # Cobertura de código
npm run test:e2e       # Testes end-to-end
```

---
