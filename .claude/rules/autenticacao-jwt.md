---
paths:
  - "src/auth/**"
  - "src/**/*.guard.ts"
---

# Autenticacao (JWT)

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
