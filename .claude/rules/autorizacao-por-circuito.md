---
paths:
  - "src/**/*.service.ts"
  - "src/**/*.guard.ts"
  - "src/**/*.controller.ts"
  - "src/common/authorization/**"
---

# Autorizacao por circuito (circuit ownership)

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
