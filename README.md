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
- **Qualidade de Código**: ESLint (Flat Config com regras strict) + Prettier + EditorConfig

## 🛠 Pré-requisitos

Para rodar este projeto, você precisará apenas do **Docker** e **Docker Compose** instalados na sua máquina.

Caso queira rodar scripts locais ou instalar dependências fora do container, recomendamos o uso do **Node.js v24** (conforme `.nvmrc`).

## ⚙️ Como Levantar o Ambiente (Setup)

O projeto está totalmente dockerizado para facilitar o setup inicial. Siga os passos abaixo:

### 1. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo para criar o seu `.env` local:

```bash
cp .env.example .env
```
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

## 📖 Documentação da API (Swagger)

Em ambiente de desenvolvimento, a documentação interativa da API está disponível em:

```
http://localhost:8080/api/docs
```

A documentação é gerada automaticamente a partir dos DTOs e controllers via CLI plugin do `@nestjs/swagger` — não é necessário adicionar `@ApiProperty()` manualmente nos DTOs.

> **Nota:** O Swagger é desabilitado automaticamente quando `NODE_ENV=production`.

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
