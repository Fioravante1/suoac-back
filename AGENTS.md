# SUOAC Backend — regras para agentes de IA

Este arquivo é a porta de entrada. As regras detalhadas vivem em `.claude/rules/` (referenciadas
também por `.agents/rules.json` para o Gemini / Antigravity) — ver o índice abaixo.

**Obrigatório para agentes sem injeção automática de `.claude/rules/` (como OpenAI Codex e Gemini
CLI):** antes de planejar ou editar qualquer arquivo, **leia explicitamente com sua ferramenta de
leitura** as regras sempre ativas em `.claude/rules/compartilhado/*.md` e os arquivos de
`.claude/rules/` correspondentes aos caminhos listados nas tabelas da seção 2.

---

## 1. Stack Tecnológico e Versões

- **Node.js**: `v24.x`
- **Framework**: `NestJS v11`
- **Adapter HTTP**: `Fastify` (Prioridade máxima de performance; não utilizar tipagens ou imports do Express)
- **Banco de Dados**: `PostgreSQL 16`
- **ORM**: `Prisma v7` (usando adapter `@prisma/adapter-pg` e `pg` driver nativo)
- **Logging**: `Pino` via `nestjs-pino` (JSON estruturado em prod, `pino-pretty` em dev)
- **Linguagem**: `TypeScript v6` (strict mode: ON, `module`/`moduleResolution`: `nodenext`)
- **Documentação do Projeto**: Pasta `docs/` na raiz do repositório, contendo:
  - `SUOAC_REQUISITOS_v2.md` — Requisitos funcionais e regras de negócio
  - `SUOAC_ERD.md` / `SUOAC_ERD.html` — Diagrama Entidade-Relacionamento do banco de dados

---

## 2. Onde as regras vivem

Cada arquivo em `.claude/rules/` declara no próprio frontmatter os caminhos (`paths:`) e gatilhos
(`trigger:` / `description:`) que o ativam. Mexer num teste não carrega as regras de Prisma; mexer
num script de banco não carrega as de Swagger. Se o seu runtime não injeta `.claude/rules/`
automaticamente, **abra e leia** os arquivos aplicáveis antes de escrever código:

| Regra (`.claude/rules/`) | Vale para |
| - | - |
| `arquitetura.md` | `src/**` |
| `prisma-e-banco.md` | `prisma/**`, `src/prisma/**`, `prisma.config.ts`, `scripts/**`, `railway.toml`, `src/generated/**` |
| `api-rest.md` | controllers, DTOs, interfaces de resposta |
| `swagger.md` | controllers e DTOs |
| `logging.md` | services, `src/common/logger/**`, `src/main.ts` |
| `hashing-de-senhas.md` | `src/common/hashing/**`, `src/auth/**`, `src/users/**` |
| `autenticacao-jwt.md` | `src/auth/**` — guards e decorators moram lá — e qualquer `*.guard.ts` |
| `autorizacao-por-circuito.md` | **services, guards e controllers** — é a regra de isolamento multi-tenant |
| `estilo-de-codigo.md` | `**/*.ts` |
| `testes.md` | `**/*.spec.ts`, `**/*.e2e-spec.ts`, `test/**` |

O subdiretório `.claude/rules/compartilhado/` vem do repositório `suoac-ai` por `git subtree` e traz
o que vale igual no backend e no frontend. **Não edite esses arquivos aqui** — a fonte é
`suoac-ai/rules/`, e a próxima sincronização sobrescreve qualquer mudança local:

| Regra (`.claude/rules/compartilhado/`) | Vale para |
| - | - |
| `postura-do-agente.md` | sempre — decisões são do usuário, dependências pendentes e verificação obrigatória |
| `jira.md` | sempre — rastreamento obrigatório de cards no projeto `SUC` |
| `branches-e-prs.md` | sempre — nome de branch, template de PR e regra de só commitar quando pedido explicitamente |
| `commits.md` | sempre — Conventional Commits em português, organização por significado, sem trailer de IA |
| `idioma-do-codigo.md` | `**/*.{ts,tsx}`, `**/*.{js,mjs,cjs}`, `prisma/schema.prisma` — identificadores em inglês, textos humanos em português |
| `aninhamento-e-ternarios.md` | `**/*.{ts,tsx}` — early returns obrigatórios, proibido `if` ou ternário aninhado |

---

## 3. Verificação obrigatória

Antes de considerar a mudança terminada, rode e deixe passar ileso:

```bash
npm run check
```

Esse comando executa, em sequência:

```bash
npm run typecheck
npm run lint
npm run test
npm run format:check
```

Atalhos: `npm run validate` (alias de `check`), `npm run lint:fix` e `npm run format` para
corrigir. Testes E2E (`npm run test:e2e`) **não** entram no `check` — exigem banco em Docker e
rodam em job próprio no CI; rode-os quando a mudança tocar um fluxo crítico (autenticação, CRUD
principal, pagamentos).

---

## 4. Fluxo de trabalho

Quando solicitado para implementar uma funcionalidade:

1. Localize (ou crie) o card no Jira, com a label `backend`, e mova para `Em andamento` — ver
   `compartilhado/jira.md`.
2. **Pense na arquitetura:** verifique a qual módulo a lógica pertence; se não existe, crie o módulo.
3. **SOLID primeiro:** separe DTOs, deixe o controller só com a requisição e o service com a lógica.
4. **Type safety:** interfaces, retornos e payloads com tipagem completa. Nunca sugira desabilitar
   regra do ESLint com `// eslint-disable-next-line`, salvo exceção justificável de integração com
   biblioteca antiga sem tipos.
5. **Testes:** toda lógica de negócio nova sai com teste unitário no mesmo PR; fluxo crítico leva E2E.
6. **Postman:** atualize `docs/suoac_postman_collection.json` com os endpoints novos e, se
   necessário, `docs/suoac_postman_environment.json` com as variáveis novas.
7. **README e PROGRESS:** atualize o `README.md` quando mudar setup, dependências, scripts,
   variáveis de ambiente ou instruções de deploy, e o `PROGRESS.md` ao concluir uma feature.
8. Rode `npm run check` antes de concluir.
9. Comente no card o que foi entregue e atualize o estado dele.

Não implemente atalhos que enfraqueçam type safety, lint, arquitetura ou testes. Se uma regra
parecer inadequada, explique o motivo e proponha o ajuste explícito no arquivo de regra em vez de
contornar localmente.
