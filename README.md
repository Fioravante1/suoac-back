# SUOAC Backend

Backend do projeto **SUOAC (Sistema Unificado de Organização e Agendamento de Consultas)**.

Este projeto é construído com tecnologias modernas para garantir alta performance, tipagem rigorosa e facilidade de desenvolvimento.

## 🚀 Tecnologias e Stack

- **Node.js**: `v24.x`
- **Framework**: [NestJS](https://nestjs.com/) `v11`
- **Adaptador HTTP**: [Fastify](https://fastify.dev/) (para maior performance em comparação ao Express)
- **ORM**: [Prisma](https://www.prisma.io/) `v7` (utilizando a nova arquitetura com Driver Adapters)
- **Banco de Dados**: [PostgreSQL 16](https://www.postgresql.org/)
- **Infraestrutura**: Docker & Docker Compose
- **Documentação da API**: [Swagger / OpenAPI 3.0](https://swagger.io/) via `@nestjs/swagger`
- **Logging**: [Pino](https://getpino.io/) via `nestjs-pino` (JSON estruturado em prod, `pino-pretty` em dev)
- **Geração de documentos**: [pdfmake](https://github.com/bpampuch/pdfmake) e [pdf-lib](https://pdf-lib.js.org/) (PDF), [write-excel-file](https://www.npmjs.com/package/write-excel-file) (XLSX — exportações financeiras)
- **Qualidade de Código**: ESLint (Flat Config com regras strict) + Prettier + EditorConfig

## 🛠 Pré-requisitos

- **Docker** e **Docker Compose** — para subir o banco PostgreSQL
- **Node.js v24** (conforme `.nvmrc`) — para rodar a API e scripts localmente

## ⚙️ Como Levantar o Ambiente (Setup)

### 1. Configurar Variáveis de Ambiente

Execute o script de setup para gerar o `.env` automaticamente a partir do `.env.example` (inclui geração do `PASSWORD_PEPPER`, `JWT_SECRET`, `JWT_REFRESH_SECRET` e `ENCRYPTION_KEY`):

```bash
npm run setup:env
```

### 2. Subir o Banco de Dados

```bash
docker compose up -d
```

Isso sobe o container `suoac-db` (PostgreSQL 16) na porta `5432`.

### 3. Rodar Migrations e Seed

```bash
npm run db:migrate    # Cria/aplica migrations no banco local
npm run db:seed       # Popula com dados iniciais de dev
```

### 4. Iniciar a API

```bash
npm run start:dev
```

A API estará disponível em: `http://localhost:8080`

## 🗄️ Banco de Dados — Operações por Ambiente

Todas as operações de banco são feitas através do script unificado `scripts/db.sh`, com aliases no `package.json`:

### Ambientes

| Ambiente | Banco | Arquivo de Env | Descrição |
|----------|-------|----------------|-----------|
| `dev` | Docker local `:5432` | `.env` | Desenvolvimento local |
| `test` | Docker local `:5433` | `.env.test` | Testes E2E (isolado) |
| `staging` | Neon (pooler) | `.env.staging` | Homologação Railway |
| `prod` | Neon (pooler) | `.env.production` | Produção Railway |

### Comandos

```bash
# ── Desenvolvimento (dev) ────────────────────────────────────
npm run db:migrate          # Cria/aplica migrations (prisma migrate dev)
npm run db:seed             # Popula com dados de desenvolvimento
npm run db:status           # Verifica status das migrations
npm run db:reset            # Reseta banco (apaga tudo e recria)
npm run db:studio           # Abre Prisma Studio (GUI)
npm run db:push             # Sincroniza schema sem criar migration

# ── Staging (homologação) ────────────────────────────────────
npm run db:migrate:staging  # Aplica migrations pendentes (migrate deploy)
npm run db:seed:staging     # Roda seed de staging

# ── Produção ─────────────────────────────────────────────────
npm run db:migrate:prod     # Aplica migrations pendentes (migrate deploy)
npm run db:seed:prod        # Roda seed de produção
```

> **⚠️ Safety nets:** Staging pede confirmação interativa. Produção exige digitar `prod` para confirmar. Os comandos `reset` e `push` funcionam **apenas em dev**.

### Uso direto do script (sem npm)

```bash
./scripts/db.sh migrate dev       # Equivalente a npm run db:migrate
./scripts/db.sh seed staging      # Equivalente a npm run db:seed:staging
./scripts/db.sh status prod       # Status das migrations em produção
./scripts/db.sh reset dev         # Reset do banco local
```

### Docker Compose

```bash
docker compose up -d                                      # Banco de dev (porta 5432)
docker compose -f docker-compose.test.yml up -d           # Banco de testes E2E (porta 5433)
docker compose down                                       # Para o banco de dev
docker compose -f docker-compose.test.yml down             # Para o banco de testes
```

## 🚂 Deploy (Railway)

O projeto roda no [Railway](https://railway.app/) com dois environments conectados a branches do Git:

| Environment | Branch | `NODE_ENV` | Swagger | Logs |
|-------------|--------|------------|---------|------|
| **production** | `main` | `production` | Desabilitado | JSON (stdout) |
| **homologacao** | `develop` | `staging` | Habilitado (`/api/docs`) | JSON (stdout) |

### Workflow de branches

```
develop  ← desenvolvimento e homologação
  │
  └──▶ main  ← produção (merge via PR)
```

1. Desenvolva na branch `develop` (ou feature branches mergeadas em `develop`)
2. O Railway faz deploy automático de `develop` no environment de homologação
3. Após validação, abra PR de `develop` → `main`
4. O merge dispara deploy automático em produção

### Configuração no Railway

Cada environment deve ter suas próprias env vars configuradas no dashboard:
- `DATABASE_URL`, `DIRECT_URL` — URLs do banco (Neon ou outro PostgreSQL)
- `NODE_ENV` — `staging` ou `production`
- `PORT` — porta da API (Railway injeta automaticamente)
- `PASSWORD_PEPPER`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` — secrets (gerar valores únicos por environment)
- `LOG_LEVEL` — nível de log (recomendado: `info` para ambos)
- `ALLOWED_ORIGINS` — origens CORS (comma-separated, ex: `https://suoac.example.com`)
- `RATE_LIMIT_MAX` — requests por minuto por IP (default: `100`)

O arquivo `railway.toml` na raiz configura health check (`/health`), política de restart e timeout.

## 📖 Documentação da API (Swagger)

Em ambiente de desenvolvimento, a documentação interativa da API está disponível em:

```
http://localhost:8080/api/docs
```

A documentação é gerada automaticamente a partir dos DTOs e controllers via CLI plugin do `@nestjs/swagger` — não é necessário adicionar `@ApiProperty()` manualmente nos DTOs.

> **Nota:** O Swagger é desabilitado automaticamente quando `NODE_ENV=production`.

## 🔒 Segurança

O backend implementa múltiplas camadas de segurança para produção:

- **CORS**: Origens controladas via `ALLOWED_ORIGINS`. Em dev, aceita `localhost` com qualquer porta. Em staging/prod, fail-closed (sem origins configuradas = nenhuma permitida).
- **Helmet**: Security headers (X-Content-Type-Options, X-Frame-Options, etc.) habilitados em todos os ambientes. CSP habilitado apenas em produção (desabilitado em dev/staging para permitir Swagger UI).
- **Rate Limiting**: Limite de requests por IP/minuto via `RATE_LIMIT_MAX` (default: 100). `trustProxy: true` para funcionar atrás de reverse proxy (Railway).
- **Filtro Global de Exceções**: Erros do Prisma (P2002, P2003, P2025) mapeados para HTTP status codes adequados. Stacktraces nunca expostos ao client.

## 📦 Estrutura do Projeto e Padrões Adotados

### Prisma 7 (Mudanças de Arquitetura)
Este projeto utiliza o Prisma v7, que introduziu mudanças significativas:
- **Client Gerado Localmente**: O Prisma Client não é mais gerado na pasta `node_modules`. Ele é gerado dentro de `src/generated/prisma`. **Não modifique arquivos nesta pasta**. Eles são ignorados pelo Git (`.gitignore`) e pelo ESLint/Prettier.
- **Prisma Config**: As configurações de runtime estão no arquivo `prisma.config.ts`. A string de conexão foi removida do `schema.prisma`. O carregamento de variáveis é determinístico: `NODE_ENV` → arquivo `.env` correspondente.
- **Driver Adapters**: Utilizamos o pacote `@prisma/adapter-pg` acoplado ao `pg` nativo. A conexão com o banco é instanciada no `PrismaService` via *composition*.

### Lint e Formatação
O projeto adota regras de tipagem muito rigorosas para evitar *technical debt*:
- **Prettier**: Responsável exclusivo pela formatação (`printWidth: 120`, `singleQuote: true`).
- **ESLint (Flat Config)**: Responsável pela qualidade e *Type Safety*. O uso de `any` explícito gera **erros** (`@typescript-eslint/no-explicit-any: error`). Regras estritas de *async/await* e *floating promises* estão ativadas.
- **TypeScript**: `strict: true` ativado no `tsconfig.json`, além de validações para variáveis locais e parâmetros não utilizados.

Para verificar ou corrigir problemas localmente (requer Node na máquina host):
```bash
# Formatar o código
npm run format

# Rodar o Lint
npm run lint

# Checar os tipos TypeScript (sem compilar)
npm run typecheck

# Tentar corrigir erros de Lint automaticamente
npm run lint:fix
```

### Configurações de Editor
Para manter consistência de estilo de código:
- O projeto possui um `.editorconfig`.
- Possui configurações locais para o VS Code em `.vscode/settings.json` (Format On Save habilitado com o Prettier como formatador padrão e ESLint Auto Fix).

## 📄 Licença

Este projeto é de uso restrito / UNLICENSED.
