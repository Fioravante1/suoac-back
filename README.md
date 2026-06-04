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
- **Qualidade de Código**: ESLint (Flat Config com regras strict) + Prettier + EditorConfig

## 🛠 Pré-requisitos

Para rodar este projeto, você precisará apenas do **Docker** e **Docker Compose** instalados na sua máquina.

Caso queira rodar scripts locais ou instalar dependências fora do container, recomendamos o uso do **Node.js v24** (conforme `.nvmrc`).

## ⚙️ Como Levantar o Ambiente (Setup)

O projeto está totalmente dockerizado para facilitar o setup inicial. Siga os passos abaixo:

### 1. Configurar Variáveis de Ambiente

Execute o script de setup para gerar o `.env` automaticamente a partir do `.env.example` (inclui geração do `PASSWORD_PEPPER`, `JWT_SECRET`, `JWT_REFRESH_SECRET` e `ENCRYPTION_KEY`):

```bash
npm run setup:env
```

O `.env` deve conter ao menos as seguintes variáveis:
- `DATABASE_URL` — URL de conexão com o PostgreSQL
- `PORT` — Porta da API (default: `8080`)
- `NODE_ENV` — Ambiente (`development` / `production`)
- `LOG_LEVEL` — Nível de log do Pino (`debug`, `info`, etc.)
- `PASSWORD_PEPPER` — Pepper para hashing de senhas (Argon2). Gerado automaticamente pelo `setup:env`.
- `JWT_SECRET` — Chave secreta para assinar access tokens JWT. Gerado automaticamente pelo `setup:env`.
- `JWT_REFRESH_SECRET` — Chave secreta para assinar refresh tokens JWT. Gerado automaticamente pelo `setup:env`.
- `JWT_EXPIRATION` — Tempo de vida do access token em segundos (default: `900` = 15min).
- `JWT_REFRESH_EXPIRATION` — Tempo de vida do refresh token em segundos (default: `604800` = 7d).
- `ENCRYPTION_KEY` — Chave AES-256-GCM para criptografia de dados sensíveis (RG). 32 bytes hex. Gerado automaticamente pelo `setup:env`.
- `ALLOWED_ORIGINS` — Origens CORS permitidas (comma-separated). Em dev, `localhost` com qualquer porta é permitido automaticamente. Em staging/prod, se vazio, nenhuma origin é permitida (fail-closed).
- `RATE_LIMIT_MAX` — Requests por minuto por IP (default: `100`).

*(Opcional) Verifique se a porta `5432` ou `3000` já estão em uso na sua máquina. Se estiverem, altere no `.env` e no `docker-compose.yml`.*

### 2. Subir os Containers

Execute o Docker Compose para fazer o build da imagem da API e subir o banco de dados:

```bash
docker compose up --build
```

Isso fará o seguinte:
- Subirá o container `suoac-db` (Postgres).
- Falará o build da aplicação Node.
- Rodará `npx prisma generate` dentro do container (gerando o client em `src/generated/prisma`).
- Iniciará o servidor NestJS em modo `watch` (hot-reload habilitado via bind mount).

A API estará disponível em: `http://localhost:8080`

### 3. Rodar as Migrations do Banco de Dados

Com os containers rodando, abra outro terminal e execute o comando abaixo para aplicar as migrações (criar as tabelas no banco de dados):

```bash
docker compose exec api npx prisma migrate dev
```

*(Nota: como estamos na versão 7 do Prisma, o comando lê as credenciais diretamente do `prisma.config.ts` através da variável `DATABASE_URL`)*

### 4. Rodar o Seed (dados iniciais)

```bash
docker compose exec api npx prisma db seed
```

### 5. Produção (Neon)

Para aplicar migrations e seed no banco Neon (produção), utilize os scripts dedicados. Eles carregam automaticamente o `.env.production` com as URLs do Neon:

```bash
npm run migrate:prod   # aplica migrations pendentes
npm run seed:prod      # roda o seed
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

### Scripts de migration/seed por ambiente

```bash
# Dev local (Docker)
npm run migrate:dev
docker compose exec api npx prisma db seed

# Staging (homologação Railway)
npm run migrate:staging
npm run seed:staging

# Produção (Railway)
npm run migrate:prod
npm run seed:prod
```

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
- **Prisma Config**: As configurações de runtime estão no arquivo `prisma.config.ts`. A string de conexão foi removida do `schema.prisma`.
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
