# SUOAC Backend - Regras & Diretrizes para Agentes de IA

Este documento e a **fonte unica de verdade** para todas as regras, padroes arquiteturais e boas praticas que qualquer agente de IA (Claude, Gemini, etc.) **deve** seguir ao interagir com o codigo do backend do projeto SUOAC.

> **Importante:** Os arquivos `CLAUDE.md` e `GEMINI.md` apenas referenciam este arquivo. Toda regra nova ou alteracao deve ser feita **aqui**.

---

## 1. Stack Tecnológico e Versões

- **Node.js**: `v24.x`
- **Framework**: `NestJS v11`
- **Adapter HTTP**: `Fastify` (Prioridade máxima de performance; não utilizar tipagens ou imports do Express)
- **Banco de Dados**: `PostgreSQL 16`
- **ORM**: `Prisma v7` (usando adapter `@prisma/adapter-pg` e `pg` driver nativo)
- **Logging**: `Pino` via `nestjs-pino` (JSON estruturado em prod, `pino-pretty` em dev)
- **Linguagem**: `TypeScript v6` (strict mode: ON, `module`/`moduleResolution`: `nodenext`)
- **Documentação do Projeto**: Pasta `docs/` na raiz do repositório, contendo:
  - `SUOAC_REQUISITOS_v2.md` — Requisitos funcionais e regras de negócio
  - `SUOAC_ERD.md` / `SUOAC_ERD.html` — Diagrama Entidade-Relacionamento do banco de dados

---

## 2. Arquitetura e Organização (Feature-based Clean Architecture)

O projeto deve seguir princípios **SOLID** e **Clean Architecture**, organizados por domínios da aplicação (Feature-Based) em vez de organização técnica.

### Estrutura de Diretórios
- **NÃO FAÇA:** Organizar por camada técnica na raiz (ex: `src/controllers`, `src/services`).
- **FAÇA:** Organizar por feature/domínio de negócio:
  ```text
  src/
    ├── auth/                 # Domínio de autenticação
    │   ├── dto/              # Objetos de transferência de dados (zod ou class-validator)
    │   ├── entities/         # Entidades puras do domínio
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   └── auth.module.ts
    ├── users/                # Domínio de usuários
    ├── common/               # Shared logic (guards, pipes, interceptors, decorators)
    └── prisma/               # Database infrastructure layer
  ```

### Padrões de Injeção de Dependência (DI) e Encapsulamento
- Cada domínio (ex: `UsersModule`) deve exportar apenas aquilo que deve ser público para outros módulos.
- Nunca injete um provider (ex: `UsersService`) de outro módulo diretamente sem importar o `UsersModule` no módulo atual.
- Use **Interfaces** ou Abstract Classes para injetar dependências (Dependency Inversion Principle) sempre que houver lógica de infraestrutura (ex: APIs externas, Mailers, Storage), permitindo fácil "mock" nos testes.

### Controllers e Services (Responsabilidade Única - SRP)
- **Controllers devem ser anêmicos:** Devem lidar APENAS com a camada HTTP (receber request, validar input com pipes, chamar UseCase/Service, mapear resposta).
- **Services/UseCases são o coração:** Toda a lógica de negócio deve residir aqui, totalmente agnóstica ao protocolo HTTP (sem acessar `req`, `res`, ou headers diretamente).

### Interfaces de Resposta (DRY)
- **Nunca repita tipos de retorno inline.** Quando o mesmo tipo de retorno aparece em mais de um lugar (controller, service, testes), ele **DEVE** ser extraído para uma interface na pasta `interfaces/` do módulo.
  ```text
  src/circuits/
    ├── interfaces/
    │   └── circuit-response.interface.ts   ← Interface centralizada
    ├── circuits.controller.ts              ← usa Promise<CircuitResponse>
    └── circuits.service.ts                 ← usa Promise<CircuitResponse>
  ```
- Nomenclatura: `{Entity}Response` (ex: `CircuitResponse`, `EventResponse`, `PassengerResponse`).

---

## 3. Diretrizes do Prisma 7 e Banco de Dados

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

## 4. Estilo de Código, Tipagem e Lint

O projeto está configurado com regras severas de qualidade (`ESLint Flat Config`) e formatação (`Prettier`).

- **Prettier**:
  - `printWidth: 120`
  - `singleQuote: true`
  - `trailingComma: all`
  - Formatação *on save* está ativada. **NÃO GERE CÓDIGO FORA DESTE PADRÃO.**

- **ESLint & TypeScript**:
  - `strict: true`: Nenhuma variável local, parâmetro ou import pode ficar sem uso. Acesso a arrays/dicionários (`noUncheckedIndexedAccess`) pode ser `undefined`.
  - **Nunca use `any`**: Tipagens `any` e casts inseguros disparam erros de compilação.
  - **Return Types**: Toda função exportada (controllers, services) *DEVE* ter o tipo de retorno explicitamente anotado (ex: `async findAll(): Promise<User[]> { ... }`).
  - **`@types` explícitos**: o TS 6 não inclui mais `@types/*` automaticamente. Pacotes que injetam globais precisam estar em `compilerOptions.types` (`tsconfig.json`: `["node", "jest"]`; `tsconfig.build.json`: `["node"]`). Tipos consumidos por `import` não precisam ser listados.
  - **`rootDir` explícito**: exigido pelo TS 6 (TS5011). `tsconfig.json` usa `./` (cobre `src/`, `test/`, `prisma/`, `scripts/`) e `tsconfig.build.json` sobrescreve para `./src`, preservando o layout do `dist/`.
  - **Type Imports**: Use `import type` para importar apenas tipos, mantendo o bundle limpo (o ESLint conserta isso sozinho se usar `npm run lint:fix`).
  - **Async Safety**: Toda Promise *deve* ter um `await`, um `.catch()`, ou retornar o valor. Promises pendentes na raiz (ex: entrypoints) devem ser marcadas com `void` (`void bootstrap();`).
  - **Nunca aninhe `if`s**: Use early returns (guard clauses) com condições combinadas em vez de `if` dentro de `if`. Cada validação deve ser um bloco independente no nível raiz da função.
    ```typescript
    // Errado — ifs aninhados
    if (condA) {
      if (condB) {
        throw new Error('...');
      }
    }

    // Correto — guard clause com condição combinada
    if (condA && condB) {
      throw new Error('...');
    }
    ```
  - **Nunca aninhe ternários**: encadear `a ? x : b ? y : z` obriga quem lê a descartar cada caso anterior para entender o próximo, e o último só se explica por eliminação. Use early returns com cada caso nomeado. Ternário simples, de duas alternativas claras, continua bem-vindo.
    ```typescript
    // Errado — cadeia de ternários
    const status = payment.paidAt ? 'PAID' : payment.dueDate < now ? 'OVERDUE' : 'PENDING';

    // Correto — early returns, cada caso se explica sozinho
    function resolvePaymentStatus(payment: Payment, now: Date): PaymentStatus {
      if (payment.paidAt) return 'PAID';
      if (payment.dueDate < now) return 'OVERDUE';
      return 'PENDING';
    }
    ```
  - **Identificadores de código são sempre em inglês**: classes, métodos, variáveis, parâmetros, tipos, propriedades de DTO, campos do schema Prisma e chaves de objeto. O português fica para o que é lido por pessoas — comentários, mensagens de erro da API, textos de log e descrições de teste (`describe`/`it`). Nunca misture os dois num mesmo identificador.
    ```typescript
    // Correto
    async function findOverduePayments(): Promise<PaymentResponse[]> { ... }
    throw new NotFoundException('Passageiro não encontrado');
    it('deve lançar 409 quando o RG já existe na congregação', () => { ... });

    // Errado
    async function buscarPagamentosVencidos(): Promise<RespostaPagamento[]> { ... }
    const statusPagamento = 'pago';
    ```

---

## 5. Padrões de API RESTful

### Naming Conventions (URLs)

- **Substantivos, nunca verbos:** As rotas representam *recursos*. O verbo HTTP define a ação.
  - Errado: `GET /getUsers`, `POST /createEvent`
  - Correto: `GET /users`, `POST /events`
- **Plural para coleções:** Sempre use o plural para endpoints de coleção.
  - Correto: `GET /circuits`, `GET /circuits/:id`
- **Kebab-case para URLs:** Usar letras minúsculas e hífens.
  - Correto: `/event-days`, `/congregation-event-status`
  - Errado: `/eventDays`, `/EventDays`
- **Aninhamento raso (máx 2 níveis):** Evitar rotas profundamente aninhadas.
  - Correto: `GET /circuits/:circuitId/congregations`
  - Errado: `GET /circuits/:circuitId/congregations/:congId/passengers/:passId/payments`

### Métodos HTTP e Semântica

| Método | Uso | Idempotente |
|--------|-----|-------------|
| `GET` | Buscar recurso(s). Nunca altera estado | Sim |
| `POST` | Criar novo recurso | Não |
| `PATCH` | Atualização parcial de recurso existente | Sim |
| `PUT` | Substituição completa de recurso (usar apenas quando fizer sentido) | Sim |
| `DELETE` | Remover recurso (pode ser soft-delete) | Sim |

### Status Codes (usar consistentemente)

| Código | Quando usar |
|--------|-------------|
| `200 OK` | GET, PATCH, PUT bem-sucedido |
| `201 Created` | POST bem-sucedido (recurso criado) |
| `204 No Content` | DELETE bem-sucedido (sem body na resposta) |
| `400 Bad Request` | Payload inválido, campo ausente, formato incorreto |
| `401 Unauthorized` | Token ausente ou expirado (não autenticado) |
| `403 Forbidden` | Autenticado, mas sem permissão para o recurso |
| `404 Not Found` | Recurso não existe |
| `409 Conflict` | Conflito de estado (ex: RG duplicado, e-mail já existe) |
| `422 Unprocessable Entity` | Dados válidos sintaticamente, mas regra de negócio violada |
| `429 Too Many Requests` | Rate limiting excedido |
| `500 Internal Server Error` | Erro inesperado no servidor |

### Formato de Resposta (Consistente)

Todas as respostas de sucesso devem seguir o padrão:

```json
// GET /circuits/:id → 200
{
  "id": "uuid",
  "name": "Circuito SP-01",
  "city": "São Paulo",
  "state": "SP",
  "createdAt": "2026-01-15T10:30:00Z",
  "updatedAt": "2026-01-15T10:30:00Z"
}
```

### Formato de Erro (Consistente)

Todas as respostas de erro devem seguir um padrão uniforme:

```json
// POST /circuits → 400
{
  "statusCode": 400,
  "message": ["name must be a string", "city should not be empty"],
  "error": "Bad Request"
}

// GET /circuits/:id → 404
{
  "statusCode": 404,
  "message": "Circuito não encontrado",
  "error": "Not Found"
}
```

### Paginação

Endpoints que retornam listas **devem** suportar paginação para evitar retornar dados ilimitados:

```
GET /circuits/:circuitId/congregations?page=1&limit=20&sort=name:asc
```

Resposta paginada:
```json
{
  "data": [...],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

### Regras de Implementação no NestJS

- **DTOs são obrigatórios:** Todo endpoint que recebe dados (POST, PATCH, PUT) *DEVE* ter um DTO com validação via `class-validator`.
- **Nunca exponha entidades do Prisma diretamente:** Mapear a resposta para um formato controlado, removendo campos sensíveis (ex: `passwordHash`, `rgEncrypted`).
- **camelCase nas respostas JSON:** O Prisma já retorna em camelCase. Manter esse padrão. Não usar snake_case no JSON da API.
- **Datas em ISO 8601:** Todas as datas devem ser retornadas no formato `2026-01-15T10:30:00.000Z`.
- **UUIDs como identificadores:** Todos os IDs são UUIDs v4 (já definido no schema Prisma).

---

## 6. Documentação da API (Swagger / OpenAPI)

O projeto utiliza `@nestjs/swagger` para gerar documentação interativa OpenAPI 3.0 automaticamente.

- **URL:** `http://localhost:8080/api/docs` (disponível apenas quando `NODE_ENV !== 'production'`).
- **CLI Plugin:** Configurado em `nest-cli.json` com `classValidatorShim: true` e `introspectComments: true`. Isso significa que os decorators `@ApiProperty()` **não precisam ser adicionados manualmente** nos DTOs — o plugin infere os tipos automaticamente a partir do TypeScript e dos decorators do `class-validator`.
- **`@ApiTags()`:** Todo controller **deve** ter o decorator `@ApiTags('NomeDoRecurso')` para agrupar endpoints na UI do Swagger.
- **`PartialType`:** Em DTOs de update que usam `PartialType`, o import **deve** vir de `@nestjs/swagger` (não de `@nestjs/mapped-types`), para que os metadados OpenAPI sejam propagados corretamente.
  ```typescript
  // Correto
  import { PartialType } from '@nestjs/swagger';
  // Errado
  import { PartialType } from '@nestjs/mapped-types';
  ```

---

## 7. Logging (Pino)

O projeto utiliza **Pino** via `nestjs-pino` para logging estruturado, integrado nativamente com Fastify.

### Configuração

- **Arquivo central:** `src/common/logger/logger.config.ts` — exporta `getLoggerConfig()` com toda a configuração do `pino-http`.
- **`AppModule`:** Importa `LoggerModule.forRoot(getLoggerConfig())`.
- **`main.ts`:** Usa `bufferLogs: true` e `app.useLogger(app.get(Logger))` para substituir o logger padrão do NestJS.

### Níveis de Log

Controlado pela variável de ambiente `LOG_LEVEL`. Valores possíveis (Pino): `fatal`, `error`, `warn`, `info`, `debug`, `trace`.

| Ambiente | Nível padrão | Formato |
|----------|-------------|---------|
| Dev | `debug` | `pino-pretty` (colorido, single-line) |
| Prod | `info` | JSON puro (stdout) |

### Redaction (Dados Sensíveis)

Os seguintes caminhos são automaticamente censurados como `[REDACTED]` nos logs (top-level e nested):

- `req.headers.authorization`, `req.headers.cookie`
- `password`, `passwordHash`, `token`, `pepper`, `secret` (top-level)
- `*.password`, `*.passwordHash`, `*.token`, `*.pepper`, `*.secret` (nested)
- `rg`, `cpf` (top-level)
- `*.rg`, `*.cpf` (nested)

### Request ID (Correlation)

Cada request recebe um ID único (`X-Request-ID` do header ou `crypto.randomUUID()`) disponível em todos os logs daquele request.

### Regras

- **Nunca use `console.log`**: Sempre use o logger do NestJS (`Logger` de `@nestjs/common`) ou `PinoLogger` de `nestjs-pino`.
- **Não logar dados sensíveis**: A redaction cuida dos caminhos configurados, mas evite logar payloads completos de request/response.

---

## 7.5. Hashing de Senhas (Argon2 + Pepper)

### Stack
- **Algoritmo**: Argon2id (RFC 9106, recomendado pela OWASP)
- **Biblioteca**: `argon2` (node-argon2) — bindings C nativos com suporte ao parametro `secret`
- **Pepper**: via parametro nativo `secret` do Argon2 (NAO via HMAC pre-hash)

### Configuracao (Parametros)
| Parametro | Valor | Justificativa |
|-----------|-------|---------------|
| `type` | `argon2id` | Hibrido: resistente a side-channel e GPU attacks |
| `memoryCost` | 65536 (64 MiB) | 3.4x acima do minimo OWASP (19 MiB) |
| `timeCost` | 3 | 3 iteracoes |
| `parallelism` | 1 | Previne DoS (cada request aloca memoryCost * p) |
| `hashLength` | 32 | 256-bit output |
| `salt` | Automatico | 16 bytes random por hash (gerenciado pelo argon2) |

### Arquitetura
- **Localizacao**: `src/common/hashing/` (cross-cutting, reutilizavel por auth, users, etc.)
- **HashingService**: Injectable via `HashingModule`, expoe `hash()`, `verify()`, `needsRehash()`
- **Pepper**: carregado de `PASSWORD_PEPPER` env var via `ConfigService`. Fail-fast se ausente.

### Regras
- **Nunca use bcrypt** — Argon2id e o padrao do projeto
- **Nunca implemente hashing fora do HashingService** — centralize toda logica de hashing
- **Nunca logue o pepper** — a redaction do Pino cobre `*.pepper` e `*.secret`
- **Nunca logue password hashes** — a redaction cobre `*.passwordHash`
- **Mock o HashingService nos testes** — apenas `hashing.service.spec.ts` roda argon2 real
- **`needsRehash()`** — usar no login para migracao transparente de parametros

---

## 7.6. Autenticacao (JWT)

### Stack
- **Modulo**: `@nestjs/jwt` com guard customizado (`CanActivate`) — sem Passport
- **Tokens**: Access token (15min) + Refresh token (7d) com rotation
- **Hash do refresh token**: SHA-256 armazenado no campo `User.refreshTokenHash`

### Fluxo
1. `POST /auth/login` — valida email/senha, retorna `{ accessToken, refreshToken, user }`
2. Requests autenticados enviam `Authorization: Bearer <accessToken>`
3. `POST /auth/refresh` — valida refresh token, gera novos tokens (rotation), invalida o anterior
4. `POST /auth/logout` — limpa `refreshTokenHash` do usuario (requer autenticacao)

### Guards Globais (ordem de execução)
1. **`JwtAuthGuard`** — Verifica Bearer token em TODAS as rotas.
   - Rotas publicas: decorar com `@Public()` para skip (ex: `/auth/login`, `/auth/refresh`)
2. **`RolesGuard`** — Verifica role do usuario.
   - Usar `@Roles('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT')` no controller/handler
   - Sem `@Roles()` definido → permite qualquer usuario autenticado
3. **`CircuitOwnershipGuard`** — Verifica ownership do circuito em rotas com `:circuitId` no path.
   - Ver seção 7.7 para detalhes

### Regras Gerais de Guards
- **Guards sao a primeira barreira, nao a unica barreira:** guards validam autenticacao, role e parametros estruturais da rota. Services ainda **DEVEM** validar ownership do recurso real carregado do banco antes de retornar ou alterar dados.
- **Nao presuma que query/body foram validados pelo guard:** `CircuitOwnershipGuard` olha apenas `:circuitId` no path. Qualquer `circuitId`, `congregationId`, `eventId`, `passengerId` ou outro identificador vindo de query/body precisa ser validado no service contra o recurso pai correto.
- **Rotas com `:circuitId` continuam exigindo validacao no service:** o guard bloqueia circuitos divergentes no path, mas nao prova que filtros opcionais pertencem ao circuito. Ex: `GET /circuits/:circuitId/passengers?congregationId=...` deve validar que a congregacao filtrada pertence ao `circuitId`.
- **Roles de congregacao nunca podem cair em listagem de circuito inteiro:** se `!isCircuitRole(user.role)`, o service deve exigir `user.congregationId` presente e restringir a consulta a essa congregacao. Se `user.congregationId` for `null`, lancar `ForbiddenException`.
- **Use guards para politica HTTP transversal, nao para regra de negocio especifica:** regras dependentes de dados do banco (ex: evento pertence ao circuito, passageiro pertence a congregacao, pagamento pertence a inscricao) ficam no service/use case com queries explicitas e testes unitarios.
- **Toda nova regra de guard precisa de testes:** ao criar ou alterar um guard/decorator de autorizacao, adicione specs cobrindo allow/deny, rota publica quando aplicavel, ausencia de user no request e divergencia de ownership.

### Decorators
- `@Public()` — marca rota como publica (skip JWT guard)
- `@Roles(...roles)` — define roles permitidas para o endpoint
- `@CurrentUser()` — extrai `JwtPayload` do request (ex: `@CurrentUser('sub')` retorna userId)

### Env Vars
- `JWT_SECRET` — chave para assinar access tokens (fail-fast se ausente)
- `JWT_REFRESH_SECRET` — chave para assinar refresh tokens (fail-fast se ausente)
- `JWT_EXPIRATION` — tempo de vida do access token em segundos (default: 900)
- `JWT_REFRESH_EXPIRATION` — tempo de vida do refresh token em segundos (default: 604800)

### Regras
- **Nunca use Passport** — o projeto usa guards nativos do NestJS com Fastify
- **Novas rotas sao protegidas por default** — so adicione `@Public()` quando necessario
- **Mensagens de erro genericas** — nunca revele se email existe ou nao (sempre "Credenciais invalidas")
- **Redaction** — `accessToken`, `refreshToken`, `refreshTokenHash` sao censurados nos logs do Pino

---

## 7.7. Autorização por Circuito (Circuit Ownership)

O projeto implementa isolamento multi-tenant por circuito em duas camadas complementares.

### Guard Global (`CircuitOwnershipGuard`)
- Registrado como `APP_GUARD` global (após `JwtAuthGuard` e `RolesGuard`)
- Intercepta rotas com `:circuitId` no path e compara com `user.circuitId` do JWT
- Divergência → `403 Forbidden` imediato (antes de atingir o controller)
- Escopo limitado: **nao** valida `congregationId`, `eventId`, `passengerId` ou filtros em query/body. Essa validacao pertence ao service, depois de carregar o recurso ou validar a relacao no banco.

### Utility Functions (`src/common/authorization/circuit-ownership.util.ts`)
- **`checkCircuitOwnership(user: JwtPayload, resourceCircuitId: string)`** — lança `ForbiddenException` se `user.circuitId !== resourceCircuitId`. Usar em todos os services para endpoints diretos por ID (ex: `/events/:id`, `/passengers/:id`).
- **`isCircuitRole(role: string): boolean`** — retorna `true` para `CIRCUIT_COORDINATOR` ou `CIRCUIT_ASSISTANT`. Usar para distinguir roles de circuito vs. roles de congregação.
- **`checkCongregationPermission(user: JwtPayload, resourceCongregationId: string, context?)`** — para roles de congregação, lança `ForbiddenException` se `user.congregationId !== resourceCongregationId`. Roles de circuito passam sempre.

### Assinatura Padrão de Services
Todos os methods de service que operam sobre recursos protegidos **DEVEM** receber `user: JwtPayload` como parâmetro (não strings individuais como `circuitId` ou `role`):
```typescript
// Correto — recebe o JwtPayload completo
async findOne(id: string, user: JwtPayload): Promise<EventResponse> {
  const event = await this.prisma.client.event.findUnique({ where: { id } });
  if (!event) throw new NotFoundException('Evento não encontrado');
  checkCircuitOwnership(user, event.circuitId);
  return event;
}

// Errado — parâmetros individuais
async findOne(id: string, userCircuitId?: string): Promise<EventResponse> { ... }
```

### Assinatura Padrão de Controllers
Controllers **DEVEM** usar `@CurrentUser() user: JwtPayload` e repassar o objeto completo ao service:
```typescript
// Correto — um único decorator, repassa JwtPayload
@Get(':id')
async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload): Promise<EventResponse> {
  return this.eventsService.findOne(id, user);
}

// Errado — múltiplos decorators para extrair campos individuais
async findOne(@Param('id') id: string, @CurrentUser('circuitId') circuitId: string, @CurrentUser('role') role: string) { ... }
```

### Regras
- **Nunca compare `circuitId` manualmente** — use `checkCircuitOwnership()` para consistência
- **Nunca passe strings individuais** (`userCircuitId`, `role`) — passe `user: JwtPayload` completo
- **Exceção para `create`** — methods que criam recursos vinculados a um circuito da rota (ex: `POST /circuits/:circuitId/events`) podem usar `@CurrentUser('sub') userId: string` se necessário apenas o ID do criador, pois o guard já validou o `:circuitId`
- **Filtros por recurso filho devem ser amarrados ao recurso pai:** se uma rota de circuito aceita `congregationId`, `eventId` ou outro ID em query/body, a query deve garantir pertencimento ao `circuitId` do path (ex: `where: { id: congregationId, circuitId }`) ou chamar um helper dedicado antes de listar dados.
- **Endpoints diretos por ID devem carregar o recurso antes de autorizar:** em rotas como `/passengers/:id`, `/events/:id` e `/event-passengers/:id`, busque o registro com seus relacionamentos mínimos, depois aplique `checkCircuitOwnership()` e, quando aplicavel, `checkCongregationPermission()`.
- **Roles de congregacao exigem `congregationId` valido:** antes de filtrar por congregacao do usuario, verifique explicitamente se `user.congregationId` nao e `null`. Nao use non-null assertion (`user.congregationId!`) como mecanismo de autorizacao.
- **Testes de autorizacao sao obrigatorios:** toda rota que mistura `:circuitId` com filtros opcionais por congregacao/evento/passageiro deve ter teste negando recurso de outro circuito e teste negando role de congregacao sem permissao.

---

## 8. Testes

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

## 9. Padrão de Commits (Conventional Commits)

- Use mensagens no formato: `tipo(escopo opcional): descrição breve no imperativo`
- Tipos permitidos: `feat`, `fix`, `chore`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `style`, `revert`
- Utilize `!` para mudanças incompatíveis e/ou adicione `BREAKING CHANGE:` no corpo
- Cabeçalho até 50 caracteres; corpo e rodapé com linhas até 72 caracteres
- Escreva a descrição no imperativo e em português
- `escopo` é opcional e em `kebab-case` (ex.: `user-form`, `segments-api`)
- Inclua a chave do card no rodapé: `Refs: SUC-XX` (ver §10)
- **Nunca** adicione trailers de atribuição a IA — `Co-Authored-By: Claude`, `Generated with…`,
  `🤖` ou equivalente de qualquer modelo. O histórico do repositório registra autoria humana; a
  ferramenta usada para escrever o código não é informação de commit. Vale também para descrições
  de PR e comentários no Jira.

### Exemplos

```
feat(segments-table): adicionar coluna de permissões por segmento

Adicionar exibição das permissões do usuário diretamente na tabela de
segmentos para melhorar a visibilidade do acesso.
```

```
fix(login): corrigir redirecionamento após autenticação

Ajustar rota de retorno para `/app/home` quando o provider retornar
`redirectTo` vazio.
```

```
refactor(user-service)!: unificar métodos de busca por id e email

BREAKING CHANGE: `getByEmail` removido; usar `getByIdOrEmail`.
Atualizar chamadas nas features de cadastro e perfis.
```

---

## 10. Rastreamento do Trabalho no Jira

O planejamento e o acompanhamento deste projeto vivem no Jira, no projeto **SUOAC (`SUC`)** — o
**mesmo board do frontend**. A regra é simples: **todo trabalho feito neste repositório corresponde
a um card**. Código sem card é trabalho invisível — ninguém consegue saber o que está em andamento,
o que ficou pela metade nem por que uma decisão foi tomada.

O site Atlassian é resolvido em tempo de execução via `getAccessibleAtlassianResources`. Não
registre URL nem `cloudId` em arquivos do repositório.

### Antes de começar qualquer tarefa

1. **Localize o card.** Busque por JQL no projeto `SUC` (por épico, label `backend` ou texto) antes
   de escrever qualquer linha.
2. **Se o card não existir, crie antes de codificar** — descrevendo o que será feito, não o que já
   foi. Card escrito depois vira relatório, não planejamento, e perde a função de avisar os outros
   do que está em andamento.
3. **Leia o card inteiro, inclusive os comentários.** Contrato de API acordado com o front, prazos
   combinados e mudanças de escopo costumam estar lá e não no código.
4. **Mova para `Em andamento`** quando começar de fato. Esse é o sinal que o board dá a quem olha de
   fora.

### Durante a execução

- **Desvio do que está escrito no card**: comente no card explicando o motivo **antes** de seguir.
  Não reescreva a descrição em silêncio — a descrição é o que foi combinado; o comentário é como a
  realidade mudou.
- **Decisão técnica relevante** (contrato de endpoint, formato de payload, mudança de schema
  Prisma, troca de abordagem, limite descoberto): registre como comentário no card. É o que torna a
  decisão recuperável meses depois — e, no caso de contrato de API, é o que o frontend lê.
- **Mudança de contrato que afeta o frontend**: comente no card da fatia que consome o endpoint, não
  apenas no card de backend. Quebra de contrato descoberta pelo front em tempo de integração é
  retrabalho dos dois lados.
- **Trabalho fora do escopo descoberto no caminho**: crie um card novo e siga. Inchar o card atual
  esconde esforço e atrasa o fechamento.
- **Bloqueio**: comente dizendo o que está bloqueando e de quem/do quê depende, e deixe o card em
  `Em andamento` ou mova para `A fazer` se for parar de verdade. Bloqueio silencioso é o pior estado
  possível do board.

### Ao concluir

- A verificação obrigatória (§11) precisa passar inteira.
- Comente no card: o que foi entregue, branch/PR, o que ficou de fora e por quê. Se o card expõe um
  endpoint novo, inclua método, rota, payload e códigos de resposta no comentário.
- `Em análise` enquanto o PR aguarda revisão; `Concluído` apenas **após o merge**.
- Nunca feche um card cujo trabalho você não executou ou não verificou.

### Commits, branches e PRs

- **Commitar, fazer push e abrir PR acontecem apenas quando o usuário pedir, explicitamente.**
  Terminar a implementação **não** autoriza commitar. O padrão ao concluir um trabalho é deixá-lo na
  árvore de trabalho e avisar que está pronto para revisão — o usuário revisa o diff antes de
  qualquer coisa entrar no histórico. Commitar por conta própria atropela a revisão e obriga a
  desfazer commits.
- **Commits são organizados por significado, sempre.** Cada commit é uma unidade que faz sentido
  sozinha, com um `Refs:` próprio, e pode ser revertida sem derrubar o resto. Nunca agrupe por
  arquivo, por diretório ou pela ordem em que as coisas foram escritas; nunca misture documentação,
  ajuste de ferramenta e código de produto no mesmo commit. Migration do Prisma entra no mesmo
  commit da mudança de schema que a originou.
- Branch: `tipo/suc-XX-descricao-curta` (ex.: `feat/suc-41-pagamentos-passageiro`).
- Commit: Conventional Commits conforme §9, com a chave no rodapé — o cabeçalho continua limitado a
  50 caracteres:

```text
feat(payments): registrar pagamento de passageiro

Adiciona endpoint de criacao, validacao de valor contra o saldo da
inscricao e log da mutacao.

Refs: SUC-41
```

- Título do PR começa com a chave: `SUC-41 — pagamento de passageiro`.
- **Todas estas seções são obrigatórias no corpo do PR**: card, o que muda, por que, como verificar,
  riscos e checklist. "Nada" é resposta válida para riscos; deixar a seção em branco não é. Quando o
  PR alterar contrato de API, migration ou variável de ambiente, diga isso explicitamente em
  **riscos**.
- Um PR por card, sempre que possível. Quando um PR carregar mais de um card — o que deve ser
  exceção justificada —, o título leva o card principal e a seção **Card** lista todos.

### Convenções do projeto SUC

- Tipos disponíveis: **Epic**, **História**, **Tarefa**, **Subtask**. **Não existe o tipo Bug** —
  use `Tarefa` com a label `bug`.
- **Não há Story Points nem Prioridade** configurados. Não invente campos: a organização é por
  **label**.
- Trabalho de backend fica **no mesmo projeto do frontend**, com a label `backend`, dentro do épico
  da fatia que o consome — a dependência entre front e API precisa ser visível no mesmo board.
- Labels em uso: `redesign`, `fatia-N`, `frontend`, `backend`, `design-system`, `feature-flags`,
  `corte-legado`, `divida-temporaria`, `decisao`, `testes`, `documentacao`, `bug`.
- Hierarquia: Epic → História/Tarefa. Histórias descrevem o que o usuário ganha; Tarefas descrevem
  trabalho técnico, de infraestrutura ou de backend.

### Como um card deve ser escrito

Um card é lido por alguém — ou por um agente — que não participou da conversa que o originou. Ele
precisa bastar sozinho.

Todo card tem:

- **Título**: uma ação concreta, não um tema. "Registrar pagamento de passageiro", não "Pagamentos".
- **Contexto**: por que o card existe e o que há hoje. Quando algo não existe no sistema, diga isso
  explicitamente — é a informação que mais economiza tempo de quem for executar.
- **Escopo** e, quando houver risco de confusão, **fora de escopo**.
- **Critérios de aceite verificáveis**, em checklist, cobrindo também os **casos de erro** (403 de
  outro circuito, 404, 409 de unicidade, 422 de regra de negócio) e não apenas o caminho feliz.
- **Contrato esperado**, quando o card expõe endpoint: rota, método, payload e códigos de resposta.
- **Dependências** nomeadas pela chave do card (`Depende de SUC-35`).
- **Decisões pendentes** explicitadas, com quem decide e quando — nunca escondidas numa frase vaga.

Não são aceitáveis: card de uma linha, título genérico ("melhorar a API"), critério de aceite não
verificável ("ficar rápido"), ou escopo que só existe na cabeça de quem escreveu.

### O que não fazer

- Criar card duplicado sem buscar antes.
- Usar o Jira como changelog de commits — o histórico do Git já faz isso. O card registra
  **intenção, decisão e estado**.
- Marcar como `Concluído` algo parcialmente entregue; o correto é comentar o que falta e manter o
  estado real.
- Alterar cards de épicos de fatias futuras para refletir ideias novas sem registrar o porquê.

---

## 11. Fluxo de Trabalho e AI Assistant

Quando solicitado para implementar uma nova funcionalidade:
0. **Jira:** Localize (ou crie) o card no projeto `SUC` com a label `backend` e mova para
   `Em andamento` — ver §10.
1. **Pense na Arquitetura:** Verifique em qual módulo a nova lógica pertence. Se não existe, crie o módulo.
2. **SOLID Primeiro:** Separe DTOs, crie o Controller lidando só com a requisição, e o Service para a lógica.
3. **Type Safety:** Garanta que todas as interfaces, retornos e payloads tenham tipagem completa. NUNCA sugira a desabilitação de regras do ESLint com `// eslint-disable-next-line` (apenas em exceções justificáveis de integração com bibliotecas untyped antigas).
4. **Testes:** Ao implementar qualquer lógica de negócio, crie os testes unitários correspondentes no mesmo PR. Testes E2E devem ser adicionados para os fluxos críticos.
5. **Logging Estratégico:** Adicione logs nos services usando `Logger` do `@nestjs/common` (`private readonly logger = new Logger(NomeService.name)`). Siga as regras de nível:
   - `debug` — Leituras/listagens (parâmetros de paginação, filtros aplicados). Alto volume, útil apenas em debugging.
   - `log` (info) — Mutações bem-sucedidas (create, update, soft-delete). Inclua o ID do recurso criado/alterado.
   - `warn` — Violações de regra de negócio: not-found (404), conflitos de unicidade (409), operações destrutivas (hard-delete).
   - `error` — Falhas inesperadas (erros de infra, exceções não tratadas).
   - **Não logar em controllers** — são anêmicos; o `pino-http` já cobre request/response automaticamente.
   - **Não logar payloads completos** — apenas IDs e metadados relevantes (name, code, circuitId). A redaction do Pino cuida de campos sensíveis.
   - **Nunca usar `console.log`** — sempre `this.logger.log()`, `this.logger.warn()`, etc.
6. **Postman:** Atualize sempre o arquivo `docs/suoac_postman_collection.json` com os novos endpoints criados, e se necessário, o arquivo `docs/suoac_postman_environment.json` com novas variáveis.
7. **README:** Sempre que houver mudança relevante no setup do projeto, dependências, scripts, variáveis de ambiente ou instruções de desenvolvimento/deploy, atualize o `README.md` na raiz do repositório para refletir o estado atual.
8. **Progresso:** Ao concluir a implementação de uma feature, atualize o arquivo `PROGRESS.md` na raiz do repositório registrando o que foi implementado, decisões relevantes e o estado atual do projeto.
9. **Verificação obrigatória:** Antes de considerar a mudança terminada, rode e deixe passar ileso:

   ```bash
   npm run check
   ```

   Esse comando executa, em sequência:

   ```bash
   npm run typecheck
   npm run lint
   npm run test
   npm run format:check
   ```

   Atalhos: `npm run validate` (alias de `check`), `npm run lint:fix` e `npm run format` para
   corrigir. Testes E2E (`npm run test:e2e`) **não** entram no `check` — exigem banco em Docker e
   rodam em job próprio no CI; rode-os quando a mudança tocar um fluxo crítico (autenticação, CRUD
   principal, pagamentos).
10. **Jira:** Comente no card o que foi entregue e atualize o estado dele — ver §10.

Não implemente atalhos que enfraqueçam type safety, lint, arquitetura ou testes. Se uma regra
parecer inadequada, explique o motivo e proponha ajuste explícito neste arquivo em vez de contornar
localmente.
