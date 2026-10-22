---
trigger: always_on
description: Padrão de commits (Conventional Commits, organização por significado, sem trailer de IA)
---

# Padrão de commits

Formato: `tipo(escopo opcional): descrição breve no imperativo`, em português.

- Tipos permitidos: `feat`, `fix`, `chore`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`,
  `style`, `revert`.
- Cabeçalho até 50 caracteres; corpo e rodapé com linhas até 72 caracteres.
- `escopo` é opcional e em `kebab-case` (ex.: `user-form`, `segments-api`).
- Use `!` para mudança incompatível e/ou `BREAKING CHANGE:` no corpo.
- Inclua a chave do card no rodapé: `Refs: SUC-XX`.

**Commits são organizados por significado, sempre.** Cada commit é uma unidade que faz sentido
sozinha, com um `Refs:` próprio, e pode ser revertida sem derrubar o resto. Nunca agrupe por
arquivo, por diretório ou pela ordem em que as coisas foram escritas; nunca misture documentação,
ajuste de ferramenta e código de produto no mesmo commit.

**Nunca** adicione trailer de atribuição a IA — `Co-Authored-By: Claude`, `Generated with…`, `🤖`
ou equivalente de qualquer modelo. O histórico do repositório registra autoria humana; a ferramenta
usada para escrever o código não é informação de commit. Vale também para descrição de PR e
comentário no Jira.

```text
feat(login): adicionar formulario de entrada

Implementa campos, estados do botao e deteccao de Caps Lock
conforme o desenho novo.

Refs: SUC-23
```

```text
refactor(user-service)!: unificar métodos de busca por id e email

BREAKING CHANGE: `getByEmail` removido; usar `getByIdOrEmail`.
Atualizar chamadas nas features de cadastro e perfis.

Refs: SUC-30
```
