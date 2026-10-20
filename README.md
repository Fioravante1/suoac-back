# SUOAC Backend

Backend do projeto **SUOAC (Sistema Unificado de Organização e Agendamento de Consultas)**.

Este projeto é construído com tecnologias modernas para garantir alta performance, tipagem rigorosa e facilidade de desenvolvimento.

## 🚀 Tecnologias e Stack

- **Node.js**: `v24.x`
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/) `v6` (strict mode, `module: nodenext`)
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

> **Migrations em staging e produção são aplicadas pelo deploy, automaticamente.** O `railway.toml`
> define `preDeployCommand = ["npx prisma migrate deploy"]`, que roda **antes** de a nova versão receber
> tráfego. Se a migration falhar, o deploy é abortado e a versão anterior continua servindo. Os comandos
> manuais abaixo seguem valendo para desenvolvimento e para situação excepcional — não para o dia a dia.

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

### Migrations no deploy

O `railway.toml` é config-as-code e **sobrescreve** o que estiver no dashboard:

```toml
[deploy]
preDeployCommand = ["npx prisma migrate deploy"]
```

| Aspecto | Comportamento |
|---------|---------------|
| Quando roda | Entre o build e o deploy, em container separado, antes de receber tráfego |
| Se falhar | O deploy **não prossegue**; a versão anterior continua servindo |
| Conexão | `DIRECT_URL` (conexão direta do Neon), resolvida pelo `prisma.config.ts` — nunca o pooler |
| Comando | `migrate deploy`: aplica o que está pendente, sem criar migration e sem shadow database |
| Idempotência | Deploy sem migration pendente responde "No pending migrations to apply" e segue |

**Consequência que muda como se escreve migration:** o pre-deploy roda enquanto a versão **antiga** ainda
está no ar, então toda migration precisa ser compatível com o código anterior. Mudança destrutiva
(remover ou renomear coluna, trocar tipo, tornar `NOT NULL`) exige dois deploys — expand e depois
contract. A regra completa está em [`.claude/rules/prisma-e-banco.md`](./.claude/rules/prisma-e-banco.md).

**Proteção contra migration pendurada**, em duas camadas — deploy travado é pior que deploy falho, porque
ninguém é avisado:

| Camada | Onde | Papel |
|--------|------|-------|
| `lock_timeout = 15s` | `prisma.config.ts` | Primeira linha: a migration desiste quando está esperando um lock, que é a causa comum. Falha com `canceling statement due to lock timeout` |
| `preDeployTimeoutSeconds = 600` | `railway.toml` | Teto do tempo total: migration longa, rede ruim, provedor lento |

`statement_timeout` não é definido de propósito — mataria no meio uma migration legitimamente longa
(índice grande, backfill). O `lock_timeout` vale apenas para o CLI do Prisma; a aplicação em runtime monta
a própria conexão e não é afetada.

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
- `FRONTEND_URL` — base dos links enviados por e-mail (obrigatória). Produção: `https://suoac.com`; staging: `https://staging.suoac.com`. O link de recuperação é `${FRONTEND_URL}/reset-password?token=...`
- `RESEND_API_KEY`, `EMAIL_FROM` — credenciais do Resend (obrigatórias fora de dev/test). Uma chave por ambiente, para poder revogar staging sem derrubar produção. Remetente do projeto: `SUOAC <nao-responda@mail.suoac.com>`
- `PASSWORD_RESET_MAX_PER_HOUR` — solicitações de recuperação de senha por hora, por e-mail (default: `3`)
- `CIRCUIT_SIGNUP_MAX_PER_HOUR` — tentativas de autocadastro de circuito por hora, por e-mail (default: `5`)

Fora do Railway, usadas apenas pelo seed de produção (`npm run db:seed:prod`, em `prisma/seeds/prod.ts`): `ADMIN_EMAIL` e `ADMIN_PASSWORD`, que criam o primeiro coordenador. Sem elas o seed cai em valores de fallback e avisa no console.

A relação completa de variáveis, com comentários explicando cada uma, está no `.env.example`. Os arquivos por ambiente (`.env`, `.env.test`, `.env.staging`, `.env.production`) são locais e git-ignored: servem para rodar CLI e scripts contra cada banco, e **não** reproduzem os segredos que vivem no Railway.

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
- **Rate Limiting**: Limite de requests por IP/minuto via `RATE_LIMIT_MAX` (default: 100). `trustProxy: true` para funcionar atrás de reverse proxy (Railway). **Ressalva conhecida:** o frontend é um BFF e chama a API pelo próprio servidor, então todo o tráfego vindo dele compartilha um único IP — e, portanto, um único balde. Rastreado no card SUC-47.
- **Filtro Global de Exceções**: Erros do Prisma (P2002, P2003, P2025) mapeados para HTTP status codes adequados. Stacktraces nunca expostos ao client.

### Recuperação de senha

Três endpoints públicos, todos com o token no corpo da requisição — nunca na URL, que entra em log de acesso, histórico do navegador e cabeçalho `Referer`:

| Endpoint | Resposta |
|----------|----------|
| `POST /auth/password-reset-requests` | `204` sempre; `429` acima do limite |
| `POST /auth/password-reset-verifications` | `204` válido · `400` inválido · `409` já utilizado · `410` expirado |
| `POST /auth/password-resets` | `204` · mesmos erros de token acima |

- **Resposta neutra**: a solicitação responde igual para conta existente e inexistente, e o envio do e-mail acontece fora do request — se fosse aguardado, o tempo de resposta delataria quais contas existem.
- **Token**: 256 bits aleatórios; o banco guarda apenas o SHA-256. O valor em claro existe só no link do e-mail e nunca é logado.
- **Um link por vez**: um pedido novo invalida o anterior (o hash é limpo, mas a linha é preservada — ela é o histórico que alimenta o limite por e-mail).
- **Limite por e-mail** (`PASSWORD_RESET_MAX_PER_HOUR`, default 3): é a defesa real deste fluxo, e não o limite por IP. As rotas de recuperação ficam **fora** do `AUTH_RATE_LIMIT_MAX` de propósito: atrás do BFF, um limite de 10/min por IP bloquearia usuários legítimos uns pelos outros sem proteger ninguém. Tentativas para e-mails sem conta contam no mesmo balde, para o `429` também não revelar quais existem.
- **Sessões**: a redefinição incrementa `User.sessionVersion` e limpa o refresh token. O `JwtAuthGuard` compara a versão do token com a do banco em toda request autenticada, então o access token roubado morre no instante da redefinição em vez de sobreviver até expirar. A troca voluntária de senha (`/auth/change-password`) faz o mesmo, mantendo válida apenas a sessão que trocou.
- **Envio**: boundary `EmailSender` em `src/common/email/`. Em `development` e `test` nada é enviado — o `LogEmailSender` registra a mensagem, e **o link de recuperação sai no log da aplicação**, que é como se testa o fluxo localmente. Fora disso, `ResendEmailSender` fala com a API HTTP do Resend, com timeout de 10s e registrando o `messageId` devolvido (é por ele que se rastreia uma entrega no painel do Resend).

### Autocadastro de circuito

Dois endpoints públicos. É o único caminho pelo qual um circuito nasce sem ninguém já estar dentro do sistema.

| Endpoint | Resposta |
|----------|----------|
| `POST /auth/circuit-signups` | `202` rascunho guardado e código enviado · `409` conflito de unicidade · `422` código repetido na própria lista · `429` acima do limite |
| `POST /auth/circuit-signups/confirmations` | `201` com sessão autenticada · `400` código inválido · `409` já confirmado · `410` expirado ou tentativas esgotadas |

- **Nada é criado até a confirmação.** O primeiro endpoint valida o cadastro inteiro e grava **uma linha** em `circuit_signup_requests`, com a senha já em Argon2 e o SHA-256 do código. Circuito, congregações e usuário coordenador nascem juntos, numa transação, só quando o código é digitado. Abandonar o fluxo não deixa circuito meio-criado nem código de circuito reservado — deixa um rascunho que expira em 30 minutos e é purgado.
- **A senha não volta pelo cliente.** Ela é hasheada no primeiro passo e nunca mais trafega; a confirmação manda apenas e-mail e código. Era a alternativa descartada: guardar o payload no navegador entre as etapas.
- **Código vinculado ao e-mail.** O hash é de `email:code`, não só do código — seis dígitos dariam 10^6 hashes pré-computáveis, uma tabela que cabe num pen drive. A comparação é de tempo constante.
- **Teto de tentativas** (5 por rascunho): o limite por e-mail cobre o envio, não o chute. Esgotadas as tentativas, o rascunho morre e responde `410`, como expirado — porque é o que ele virou.
- **Limite por e-mail** (`CIRCUIT_SIGNUP_MAX_PER_HOUR`, default 5), contado dentro da transação com `pg_advisory_xact_lock`, pelo mesmo motivo da recuperação de senha. Tentativas recusadas por conflito também geram linha e contam no balde — se só as aceitas contassem, sondar e-mails sairia de graça. **Ressalva conhecida:** o limite é por e-mail, então protege o dono do endereço de uma enxurrada de códigos, mas não impede sondar um e-mail diferente a cada tentativa. O `409` de e-mail duplicado é um oráculo de enumeração assumido: toda tela de cadastro precisa dizer que o e-mail já está em uso.
- **Conflito aponta os campos.** O corpo do `409`/`422` carrega `fields` com **todos** os conflitos de uma vez (`coordinator.email`, `circuit.code`, `circuit.name`, `congregations.N.code`), e `field` apontando o primeiro para quem só sabe ler um. Reportar um conflito por vez obrigava um envio por problema descoberto, e cada envio gasta uma ficha do limite por e-mail — quem tivesse quatro conflitos ficava sem orçamento antes de corrigir tudo. A unicidade é checada duas vezes: ao guardar o rascunho, para o erro chegar cedo, e na consolidação, porque entre uma e outra passam 30 minutos.
- **O payload é descartado na consolidação.** Depois que os dados viram `users`, `circuits` e `congregations`, mantê-los no rascunho guardaria nome, e-mail, telefone e hash de senha por mais 7 dias sem motivo. O `codeHash` fica, porque é por ele que o duplo clique reencontra o rascunho usado e recebe `409` em vez de `400`.
- **Duplo clique não cria dois circuitos:** o rascunho é marcado como usado dentro da mesma transação que cria tudo, então a segunda chamada não encontra rascunho pendente e recebe `409`.
- **Reenviar é a mesma chamada** do envio inicial: o rascunho novo aposenta o anterior, porque a confirmação olha sempre o mais recente com código emitido.

### Envio de e-mail (Resend)

O domínio de envio é **`mail.suoac.com`** — subdomínio dedicado, para a reputação do e-mail transacional não se misturar com a do domínio principal, conforme recomendação do próprio Resend. O DNS fica no Cloudflare (zona `suoac.com`).

**Cuidado ao criar os registros:** os `CNAME` do Resend precisam ficar em **DNS-only** (nuvem cinza) no Cloudflare. Atrás do proxy laranja, a verificação do domínio nunca conclui.

Para provar a entrega ponta a ponta sem depender de alguém pedir recuperação de senha:

```bash
# Usa o adaptador real do Resend e o mesmo template do fluxo, com um token falso
NODE_ENV=staging npm run email:test -- destino@example.com
```

O script falha cedo e com mensagem clara se `RESEND_API_KEY`, `EMAIL_FROM` ou `FRONTEND_URL` estiverem ausentes. Se o e-mail for aceito e não chegar, a aba **Emails** do painel do Resend mostra o que aconteceu com aquele `messageId`.

## ⏱ Jobs Agendados (Ciclo de Vida do Evento)

O backend roda um cron interno (`@nestjs/schedule`, `ScheduleModule.forRoot()` no `AppModule`) que aplica de hora em hora as transições automáticas de status dos eventos — implementado em `src/events/event-lifecycle.service.ts`:

| Transição | Quando |
|-----------|--------|
| `OPEN → CLOSED` | O prazo de inscrição (`registrationDeadline`) expirou |
| `OPEN`/`CLOSED` → `FINISHED` | Já é o dia seguinte ao último dia programado do evento (`EventDay.date`), no fuso `America/Sao_Paulo` |

- As transições usam `updateMany` com o status atual no `where`, portanto são idempotentes e seguras com múltiplas instâncias da aplicação.
- Cada mudança gera um registro em `audit_logs` com `userId = null` e `actor = { type: "SYSTEM", job: "event-lifecycle" }`.
- Eventos em `DRAFT` e `CANCELLED` nunca são tocados pelo job.
- **Efeito colateral relevante:** inscrições, pagamentos e finalização de lista por congregação exigem o evento em `OPEN`. Após o encerramento automático, esses lançamentos passam a ser recusados (`422`).

Há um segundo job, diário às 4h (`password-reset-purge`, em `src/auth/password-reset.service.ts`): apaga solicitações de recuperação de senha com mais de 7 dias. Elas só têm valor dentro da janela do limite por e-mail; depois disso são apenas endereços guardados sem motivo.

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

# Rodar a verificação completa (typecheck + lint + testes + formatação)
npm run check

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
