---
paths:
  - "src/**/*.service.ts"
  - "src/common/logger/**"
  - "src/main.ts"
---

# Logging (Pino)

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

## Logging estrategico nos services

Adicione logs nos services usando `Logger` do `@nestjs/common` (`private readonly logger = new Logger(NomeService.name)`). Siga as regras de nível:
- `debug` — Leituras/listagens (parâmetros de paginação, filtros aplicados). Alto volume, útil apenas em debugging.
- `log` (info) — Mutações bem-sucedidas (create, update, soft-delete). Inclua o ID do recurso criado/alterado.
- `warn` — Violações de regra de negócio: not-found (404), conflitos de unicidade (409), operações destrutivas (hard-delete).
- `error` — Falhas inesperadas (erros de infra, exceções não tratadas).
- **Não logar em controllers** — são anêmicos; o `pino-http` já cobre request/response automaticamente.
- **Não logar payloads completos** — apenas IDs e metadados relevantes (name, code, circuitId). A redaction do Pino cuida de campos sensíveis.
- **Nunca usar `console.log`** — sempre `this.logger.log()`, `this.logger.warn()`, etc.
