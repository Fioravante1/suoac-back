---
trigger: always_on
description: Regras de branches, commits apenas sob pedido explícito e template de pull request
---

# Branches, commits e pull requests

**Commitar, fazer push e abrir PR acontecem apenas quando o usuário pedir, explicitamente.**
Terminar a implementação **não** autoriza commitar. O padrão ao concluir um trabalho é deixá-lo na
árvore de trabalho e avisar que está pronto para revisão — o usuário revisa o diff antes de
qualquer coisa entrar no histórico. Commitar por conta própria atropela a revisão e obriga a
desfazer commits.

- Branch: `tipo/suc-XX-descricao-curta` (ex.: `feat/suc-23-formulario-login`).
- Commit: ver as regras de commit; a chave do card vai no rodapé.
- Título do PR começa pela chave: `SUC-23 — formulário de entrada`.
- **O PR segue `.github/PULL_REQUEST_TEMPLATE.md`**, que abre preenchido ao criar o PR. Todas as
  seções são obrigatórias: card, o que muda, por que, como verificar, riscos e checklist. "Nada" é
  resposta válida para riscos; deixar a seção em branco não é. Quando o PR alterar contrato de API,
  migration ou variável de ambiente, diga isso explicitamente em **riscos**.
- Um PR por card, sempre que possível. Quando um PR carregar mais de um card — o que deve ser
  exceção justificada —, o título leva o card principal e a seção **Card** lista todos.
- A verificação obrigatória do repositório precisa passar inteira antes de o trabalho ser
  considerado pronto. O comando está no `AGENTS.md` de cada repositório.
