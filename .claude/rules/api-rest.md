---
paths:
  - "src/**/*.controller.ts"
  - "src/**/dto/**"
  - "src/**/interfaces/**"
---

# Padroes de API RESTful

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

### Quando o card expõe um endpoint

O card precisa carregar o contrato — rota, método, payload e códigos de resposta — e os critérios de
aceite devem cobrir os casos de erro deste projeto, não só o caminho feliz: `403` para recurso de
outro circuito, `404` de inexistente, `409` de unicidade e `422` de regra de negócio violada.
