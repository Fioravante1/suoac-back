# SUOAC Backend - System Prompts & Guidelines

Este documento define as regras, padrões arquiteturais e boas práticas estritas que a inteligência artificial (Gemini/Antigravity) **deve** seguir ao interagir com o código do backend do projeto SUOAC.

---

## 1. Stack Tecnológico e Versões

- **Node.js**: `v24.x`
- **Framework**: `NestJS v11`
- **Adapter HTTP**: `Fastify` (Prioridade máxima de performance; não utilizar tipagens ou imports do Express)
- **Banco de Dados**: `PostgreSQL 16`
- **ORM**: `Prisma v7` (usando adapter `@prisma/adapter-pg` e `pg` driver nativo)
- **Linguagem**: `TypeScript` (strict mode: ON)

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

## 5. Padrões de Versionamento (Conventional Commits)

Ao gerar mensagens de commit, respeite rigorosamente o padrão **Conventional Commits** em **Português**, usando o modo imperativo:

- `feat(scope): adiciona nova funcionalidade X`
- `fix(scope): corrige erro de validação Y`
- `chore(deps): atualiza pacote Z`
- `refactor(scope): refatora service W para remover código duplicado`

---

## 6. Fluxo de Trabalho e AI Assistant

Quando solicitado para implementar uma nova funcionalidade:
1. **Pense na Arquitetura:** Verifique em qual módulo a nova lógica pertence. Se não existe, crie o módulo.
2. **SOLID Primeiro:** Separe DTOs, crie o Controller lidando só com a requisição, e o Service para a lógica.
3. **Type Safety:** Garanta que todas as interfaces, retornos e payloads tenham tipagem completa. NUNCA sugira a desabilitação de regras do ESLint com `// eslint-disable-next-line` (apenas em exceções justificáveis de integração com bibliotecas untyped antigas).
4. **Verificação:** Ao finalizar, o código deve passar ileso pelo `npm run typecheck` e `npm run lint`.
