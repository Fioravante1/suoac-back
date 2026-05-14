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

## 5. Testes

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

## 6. Padrões de Versionamento (Conventional Commits)

Ao gerar mensagens de commit, respeite rigorosamente o padrão **Conventional Commits** em **Português**, usando o modo imperativo:

- `feat(scope): adiciona nova funcionalidade X`
- `fix(scope): corrige erro de validação Y`
- `chore(deps): atualiza pacote Z`
- `refactor(scope): refatora service W para remover código duplicado`
- `test(scope): adiciona testes unitários para o service X`

---

## 7. Fluxo de Trabalho e AI Assistant

Quando solicitado para implementar uma nova funcionalidade:
1. **Pense na Arquitetura:** Verifique em qual módulo a nova lógica pertence. Se não existe, crie o módulo.
2. **SOLID Primeiro:** Separe DTOs, crie o Controller lidando só com a requisição, e o Service para a lógica.
3. **Type Safety:** Garanta que todas as interfaces, retornos e payloads tenham tipagem completa. NUNCA sugira a desabilitação de regras do ESLint com `// eslint-disable-next-line` (apenas em exceções justificáveis de integração com bibliotecas untyped antigas).
4. **Testes:** Ao implementar qualquer lógica de negócio, crie os testes unitários correspondentes no mesmo PR. Testes E2E devem ser adicionados para os fluxos críticos.
5. **Verificação:** Ao finalizar, o código deve passar ileso pelo `npm run typecheck`, `npm run lint` e `npm run test`.

