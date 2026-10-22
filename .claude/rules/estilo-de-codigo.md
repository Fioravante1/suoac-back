---
trigger: model_decision
description: Quando criar ou editar arquivos TypeScript (**/*.ts) no backend (ESLint Flat Config, Prettier e tipagem estrita)
paths:
  - "**/*.ts"
---

# Estilo de codigo, tipagem e lint

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
  - **Nunca aninhe `if`s nem ternários**: a regra, com exemplos, vale para os dois repositórios e
    está em `.claude/rules/compartilhado/aninhamento-e-ternarios.md`.
  - **Identificadores em inglês, português para o que pessoas leem**: ver
    `.claude/rules/compartilhado/idioma-do-codigo.md`.

---
