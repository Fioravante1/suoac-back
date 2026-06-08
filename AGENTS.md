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
- **Linguagem**: `TypeScript` (strict mode: ON)
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

## 10. Fluxo de Trabalho e AI Assistant

Quando solicitado para implementar uma nova funcionalidade:
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
9. **Verificação:** Ao finalizar, o código deve passar ileso pelo `npm run typecheck`, `npm run lint` e `npm run test`.
