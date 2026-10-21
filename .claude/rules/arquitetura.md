---
trigger: model_decision
description: Quando criar ou editar arquivos em src/** (Feature-based Clean Architecture e princípios SOLID)
paths:
  - "src/**"
---

# Arquitetura e organizacao (Feature-based Clean Architecture)

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
