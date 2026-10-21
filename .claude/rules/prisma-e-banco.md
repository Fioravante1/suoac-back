---
trigger: model_decision
description: Quando criar ou editar schemas, migrations ou queries do Prisma em prisma/**, src/prisma/**, prisma.config.ts, scripts/**, railway.toml ou src/generated/**
paths:
  - "prisma/**"
  - "src/prisma/**"
  - "prisma.config.ts"
  - "scripts/**"
  - "railway.toml"
  - "src/generated/**"
---

# Prisma 7 e banco de dados

### Adapter Boundary (Restrição de Tipagem)
O Prisma v7 gera os tipos do cliente com a anotação `@ts-nocheck`, o que polui a inferência de tipos em `strict mode`.
- **Regra:** *NUNCA* exporte o tipo `PrismaClient` (classe) instanciado. O `PrismaService` deve atuar como uma barreira arquitetural.
- Exponha os tipos reais usando a interface exportada (`type PrismaClientType`) do client gerado (`src/generated/prisma/client.ts`).
- Modificações no `schema.prisma` exigem rodar `npx prisma generate` em seguida.
- **`importFileExtension = ""` no generator é obrigatório:** sem essa opção o Prisma infere a extensão dos imports a partir do `moduleResolution` do `tsconfig.json` e, sob `nodenext`, gera `import ... from "./internal/class.js"`. O `jest-resolve` (CommonJS) não resolve esse caminho e **todas** as suítes que tocam o `PrismaService` quebram com `Cannot find module './internal/class.js'`. Como `src/generated/` não é versionado, isso só aparece no CI (que roda `npx prisma generate` do zero) — nunca em uma máquina com o client já gerado.

### Queries
- O Prisma deve ser acessado **exclusivamente** pelo `PrismaService`.
- Evite passar o objeto do Prisma diretamente para funções privadas. Mantenha as consultas encapsuladas no service de repositório da respectiva entidade.

### prisma.config.ts (Carregamento de Ambiente)
- O `prisma.config.ts` carrega variáveis de ambiente de forma **determinística** via `envFileMap`:
  - `development` (default) → `.env`
  - `test` → `.env.test`
  - `staging` → `.env.staging`
  - `production` → `.env.production`
- **Fail-fast:** Lança erro se `NODE_ENV` for inválido ou se `DATABASE_URL` não estiver definida.

### Migrations no deploy (expand-and-contract)

O deploy aplica as migrations pendentes **automaticamente**, via `preDeployCommand` no `railway.toml`
(`npx prisma migrate deploy`). Roda num container separado, **antes** de a nova versão receber tráfego;
se a migration falhar, o Railway aborta o deploy e a versão anterior continua servindo.

**Isso muda como se escreve migration, e é a regra mais importante desta seção:** o pre-deploy roda
enquanto a versão **antiga** da aplicação ainda está no ar. Toda migration precisa ser compatível com o
código anterior, não só com o novo.

- **Mudança aditiva** (coluna nova nullable ou com default, tabela nova, índice novo) pode ir num único
  deploy. O código antigo ignora o que não conhece.
- **Mudança destrutiva ou incompatível** — remover coluna, renomear, trocar tipo, tornar `NOT NULL` uma
  coluna existente — **não pode** ir num único deploy. Divida em dois:
  1. **expand:** adiciona o novo formato (nullable, com default), e o código novo passa a escrever nos
     dois lugares;
  2. **contract:** num deploy posterior, já com todas as instâncias no código novo, remove o antigo.
- Renomear coluna é sempre dois deploys. `ALTER TABLE ... RENAME` quebra o código antigo no instante em
  que roda.

Outras regras:

- **Nunca aplique migration no boot da aplicação.** Com várias instâncias elas competem; uma falha
  deixa o processo em crash-loop em vez de abortar um deploy; e o healthcheck passa a depender do banco.
- **`migrate deploy` em ambiente remoto, nunca `migrate dev`.** O segundo cria migration, usa shadow
  database e pode resetar o banco.
- **Migrations usam `DIRECT_URL`**, a conexão direta do Neon — não o pooler. O `prisma.config.ts` já
  resolve isso (`DIRECT_URL ?? DATABASE_URL`); o pooler em modo transação atrapalha DDL e lock de
  migration.
- Os scripts `npm run db:migrate:staging` e `:prod` continuam existindo para situação excepcional
  (aplicar antes do merge, reparar estado). O caminho normal é o deploy.

**Duas defesas contra migration pendurada**, porque deploy travado é pior que deploy falho — ninguém é
avisado:

1. **`lock_timeout` de 15s na sessão de migration** (`prisma.config.ts`). A causa comum de travamento não
   é a migration ser lenta: é esperar um lock que outra transação segura, e essa espera é indefinida por
   padrão. Com o limite, a migration falha com `canceling statement due to lock timeout`, o deploy aborta
   e a versão anterior segue servindo. Vale só para o CLI do Prisma; o runtime monta a própria conexão em
   `PrismaService`.
2. **`preDeployTimeoutSeconds = 600`** (`railway.toml`), como teto do tempo total — cobre o que o
   `lock_timeout` não pega: migration realmente longa, rede ruim, provedor lento.

`statement_timeout` **não** é definido de propósito: ele mataria no meio uma migration legitimamente
longa, como criação de índice grande ou backfill. O teto de tempo é do `preDeployTimeoutSeconds`, não de
um limite por statement.

### Seed
- O seed é configurado em `prisma.config.ts` (campo `migrations.seed`), **não** no `package.json`.
- O arquivo de seed fica em `prisma/seed.ts` e usa `PrismaClient` + `@prisma/adapter-pg` diretamente (sem NestJS).
- A URL de conexão usa `DIRECT_URL ?? DATABASE_URL`, consistente com `prisma.config.ts` — em ambiente Neon, isso garante conexão direta (sem pooler).
- Todos os upserts utilizam chaves naturais únicas (ex: `Circuit.name`, `Congregation.code`) em vez de IDs fixos, garantindo idempotência e UUIDs aleatórios.
- Para executar:
  - **Dev:** `npm run db:seed`
  - **Staging:** `npm run db:seed:staging` (pede confirmação)
  - **Prod:** `npm run db:seed:prod` (pede confirmação dupla)

### Scripts de Banco de Dados (`scripts/db.sh`)
Todas as operações de banco são centralizadas em `scripts/db.sh`, com aliases no `package.json`:

```bash
# Desenvolvimento
npm run db:migrate          # prisma migrate dev (cria migration)
npm run db:seed             # seed de dev
npm run db:status           # status das migrations
npm run db:reset            # reseta banco (APENAS dev/test)
npm run db:studio           # abre Prisma Studio
npm run db:push             # sincroniza schema sem migration

# Staging (pede confirmação)
npm run db:migrate:staging  # prisma migrate deploy
npm run db:seed:staging

# Produção (pede confirmação dupla)
npm run db:migrate:prod     # prisma migrate deploy
npm run db:seed:prod
```

**Safety nets:**
- `reset` e `push` funcionam **apenas em dev/test**
- `migrate dev` (que cria migrations) funciona **apenas em dev**
- Staging pede confirmação interativa (`y/N`)
- Produção exige digitar `prod` para confirmar

---

### Migration e commit

Migration do Prisma entra **no mesmo commit** da mudança de `schema.prisma` que a originou. Separá-las
produz um commit que não roda sozinho e um histórico em que nenhum dos dois pode ser revertido com
segurança.
