# SUOAC Backend - System Prompts & Guidelines

Este documento define as regras, padrões arquiteturais e boas práticas estritas que a inteligência artificial (Gemini/Antigravity) **deve** seguir ao interagir com o código do backend do projeto SUOAC.

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
- 🚫 **NÃO FAÇA:** Organizar por camada técnica na raiz (ex: `src/controllers`, `src/services`).
- ✅ **FAÇA:** Organizar por feature/domínio de negócio:
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
- Modificações no `schema.prisma` exigem rodar `npx prisma generate` em seguida (o docker-compose faz isso automaticamente no boot).

### Queries
- O Prisma deve ser acessado **exclusivamente** pelo `PrismaService`.
- Evite passar o objeto do Prisma diretamente para funções privadas. Mantenha as consultas encapsuladas no service de repositório da respectiva entidade.

### Seed
- O seed é configurado em `prisma.config.ts` (campo `migrations.seed`), **não** no `package.json`.
- O arquivo de seed fica em `prisma/seed.ts` e usa `PrismaClient` + `@prisma/adapter-pg` diretamente (sem NestJS).
- A URL de conexão usa `DIRECT_URL ?? DATABASE_URL`, consistente com `prisma.config.ts` — em ambiente Neon, isso garante conexão direta (sem pooler).
- Todos os upserts utilizam chaves naturais únicas (ex: `Circuit.name`, `Congregation.code`) em vez de IDs fixos, garantindo idempotência e UUIDs aleatórios.
- Para executar:
  - **Dev (Docker):** `npx prisma db seed` (ou `docker compose exec api npx prisma db seed`)
  - **Prod (Neon):** `npm run seed:prod`

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
  - 🚫 **Nunca use `any`**: Tipagens `any` e casts inseguros disparam erros de compilação.
  - **Return Types**: Toda função exportada (controllers, services) *DEVE* ter o tipo de retorno explicitamente anotado (ex: `async findAll(): Promise<User[]> { ... }`).
  - **Type Imports**: Use `import type` para importar apenas tipos, mantendo o bundle limpo (o ESLint conserta isso sozinho se usar `npm run lint:fix`).
  - **Async Safety**: Toda Promise *deve* ter um `await`, um `.catch()`, ou retornar o valor. Promises pendentes na raiz (ex: entrypoints) devem ser marcadas com `void` (`void bootstrap();`).

---

## 5. Padrões de API RESTful

### Naming Conventions (URLs)

- **Substantivos, nunca verbos:** As rotas representam *recursos*. O verbo HTTP define a ação.
  - 🚫 `GET /getUsers`, `POST /createEvent`
  - ✅ `GET /users`, `POST /events`
- **Plural para coleções:** Sempre use o plural para endpoints de coleção.
  - ✅ `GET /circuits`, `GET /circuits/:id`
- **Kebab-case para URLs:** Usar letras minúsculas e hífens.
  - ✅ `/event-days`, `/congregation-event-status`
  - 🚫 `/eventDays`, `/EventDays`
- **Aninhamento raso (máx 2 níveis):** Evitar rotas profundamente aninhadas.
  - ✅ `GET /circuits/:circuitId/congregations`
  - 🚫 `GET /circuits/:circuitId/congregations/:congId/passengers/:passId/payments`

### Métodos HTTP e Semântica

| Método | Uso | Idempotente |
|--------|-----|-------------|
| `GET` | Buscar recurso(s). Nunca altera estado | ✅ Sim |
| `POST` | Criar novo recurso | ❌ Não |
| `PATCH` | Atualização parcial de recurso existente | ✅ Sim |
| `PUT` | Substituição completa de recurso (usar apenas quando fizer sentido) | ✅ Sim |
| `DELETE` | Remover recurso (pode ser soft-delete) | ✅ Sim |

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
  // ✅ Correto
  import { PartialType } from '@nestjs/swagger';
  // 🚫 Errado
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

Os seguintes caminhos são automaticamente censurados como `[REDACTED]` nos logs:

- `req.headers.authorization`, `req.headers.cookie`
- `*.password`, `*.passwordHash`, `*.token`
- `*.rg`, `*.cpf`

### Request ID (Correlation)

Cada request recebe um ID único (`X-Request-ID` do header ou `crypto.randomUUID()`) disponível em todos os logs daquele request.

### Regras

- **Nunca use `console.log`**: Sempre use o logger do NestJS (`Logger` de `@nestjs/common`) ou `PinoLogger` de `nestjs-pino`.
- **Não logar dados sensíveis**: A redaction cuida dos caminhos configurados, mas evite logar payloads completos de request/response.

---

## 8. Testes

O projeto utiliza **Jest** como framework de testes. Todo código de negócio implementado **DEVE** ter testes correspondentes. A ausência de testes é considerada *technical debt* e não será aceita.

### Pirâmide de Testes

| Camada | Proporção | Escopo | Banco de Dados |
|---|---|---|---|
| **Unit** | Maioria (~70%) | Service/UseCase isolado, lógica pura | ❌ Mockado |
| **Integration** | Moderado (~20%) | Módulo + dependências internas | ❌ Mockado |
| **E2E** | Poucos (~10%) | Fluxo HTTP completo (request → response) | ✅ Real (Docker) |

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

- 🚫 **Nunca ignore testes falhando:** Testes quebrando devem ser corrigidos, não desabilitados com `.skip`.
- ✅ **Test data factories:** Use funções factory para criar dados de teste dinâmicos. Evitar fixtures estáticas com dados hardcoded.
- ✅ **Uma asserção por conceito:** Cada `it()` deve testar uma única coisa. Múltiplas asserções são aceitáveis apenas quando verificam aspectos do mesmo resultado.
- ✅ **Nomenclatura descritiva:** Os nomes dos testes devem descrever o comportamento esperado em português (ex: `'deve retornar 404 quando o passageiro não existe'`).

### Scripts

```bash
npm run test           # Testes unitários
npm run test:watch     # Watch mode (desenvolvimento)
npm run test:cov       # Cobertura de código
npm run test:e2e       # Testes end-to-end
```

---

## 9. Padrões de Versionamento (Conventional Commits)

Ao gerar mensagens de commit, respeite rigorosamente o padrão **Conventional Commits** em **Português**, usando o modo imperativo:

- `feat(scope): adiciona nova funcionalidade X`
- `fix(scope): corrige erro de validação Y`
- `chore(deps): atualiza pacote Z`
- `refactor(scope): refatora service W para remover código duplicado`
- `test(scope): adiciona testes unitários para o service X`

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

