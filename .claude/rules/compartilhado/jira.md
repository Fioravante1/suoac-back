---
trigger: always_on
description: Rastreamento obrigatório do trabalho e convenções dos cards no Jira (projeto SUC)
---

# Rastreamento do trabalho no Jira

O planejamento e o acompanhamento do SUOAC vivem no Jira, no projeto **SUOAC (`SUC`)** — o **mesmo
board para frontend e backend**. A regra é simples: **todo trabalho feito nos repositórios
corresponde a um card**. Código sem card é trabalho invisível — ninguém consegue saber o que está em
andamento, o que ficou pela metade nem por que uma decisão foi tomada.

O site Atlassian é resolvido em tempo de execução via `getAccessibleAtlassianResources`. Não
registre URL nem `cloudId` em arquivos do repositório.

## Antes de começar qualquer tarefa

1. **Localize o card.** Busque por JQL no projeto `SUC` (por épico, por label ou por texto) antes de
   escrever qualquer linha.
2. **Se o card não existir, crie antes de codificar** — descrevendo o que será feito, não o que já
   foi. Card escrito depois vira relatório, não planejamento, e perde a função de avisar os outros
   do que está em andamento.
3. **Leia o card inteiro, inclusive os comentários.** Contrato de API acordado entre os dois lados,
   prazos combinados e mudanças de escopo costumam estar lá e não no código.
4. **Mova para `Em andamento`** quando começar de fato. Esse é o sinal que o board dá a quem olha de
   fora.

## Durante o trabalho

- **Desvio do que está escrito no card**: comente no card explicando o motivo **antes** de seguir.
  Não reescreva a descrição em silêncio — a descrição é o que foi combinado; o comentário é como a
  realidade mudou.
- **Decisão técnica relevante** (contrato de endpoint, formato de payload, mudança de schema, troca
  de abordagem, limite descoberto): registre como comentário no card. É o que torna a decisão
  recuperável meses depois.
- **Mudança de contrato entre frontend e backend**: comente nos cards dos **dois** lados, não apenas
  no do repositório onde você está. Quebra de contrato descoberta em tempo de integração é
  retrabalho dobrado. Se o card expõe um endpoint novo, inclua método, rota, payload e códigos de
  resposta no comentário.
- **Trabalho fora do escopo descoberto no caminho**: crie um card novo e siga. Inchar o card atual
  esconde esforço e atrasa o fechamento.
- **Bloqueio**: comente dizendo o que está bloqueando e de quem ou do que depende, e deixe o card em
  `Em andamento` ou mova para `A fazer` se for parar de verdade. Bloqueio silencioso é o pior estado
  possível do board.

## Ao concluir

- A verificação obrigatória do repositório precisa passar inteira.
- Comente no card: o que foi entregue, branch/PR, o que ficou de fora e por quê.
- `Em análise` enquanto o PR aguarda revisão; `Concluído` apenas **após o merge**.
- Nunca feche um card cujo trabalho você não executou ou não verificou.

## Convenções do projeto SUC

- Tipos disponíveis: **Epic**, **História**, **Tarefa**, **Subtask**. **Não existe o tipo Bug** —
  use `Tarefa` com a label `bug`.
- **Não há Story Points nem Prioridade** configurados. Não invente campos: a organização é por
  **label**.
- Trabalho de backend fica **no mesmo projeto**, com a label `backend`, dentro do épico da fatia que
  o consome — a dependência entre front e API precisa ser visível no mesmo board.
- Labels em uso: `redesign`, `fatia-N`, `frontend`, `backend`, `design-system`, `feature-flags`,
  `corte-legado`, `divida-temporaria`, `decisao`, `testes`, `documentacao`, `bug`.
- Hierarquia: Epic → História/Tarefa. Histórias descrevem o que o usuário ganha; Tarefas descrevem
  trabalho técnico, de infraestrutura ou de backend.

## Como um card deve ser escrito

Um card é lido por alguém — ou por um agente — que não participou da conversa que o originou. Ele
precisa bastar sozinho. Todo card tem:

- **Título**: uma ação concreta, não um tema. "Formulário de entrada no sistema", não "Login".
- **Contexto**: por que o card existe e o que há hoje. Quando algo não existe no sistema, diga isso
  explicitamente — é a informação que mais economiza tempo de quem for executar.
- **Escopo** e, quando houver risco de confusão, **fora de escopo**.
- **Critérios de aceite verificáveis**, em checklist, cobrindo também os **casos de erro** e não
  apenas o caminho feliz.
- **Dependências** nomeadas pela chave do card (`Depende de SUC-35`).
- **Decisões pendentes** explicitadas, com quem decide e quando — nunca escondidas numa frase vaga.

Não são aceitáveis: card de uma linha, título genérico ("melhorar a tela"), critério de aceite não
verificável ("ficar bom"), ou escopo que só existe na cabeça de quem escreveu.

## O que não fazer

- Criar card duplicado sem buscar antes.
- Usar o Jira como changelog de commits — o histórico do Git já faz isso. O card registra
  **intenção, decisão e estado**.
- Marcar como `Concluído` algo parcialmente entregue; o correto é comentar o que falta e manter o
  estado real.
- Alterar cards de épicos de fatias futuras para refletir ideias novas sem registrar o porquê.
