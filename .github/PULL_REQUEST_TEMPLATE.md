<!--
Titulo do PR: comece pela chave do card — "SUC-35 — API de recuperacao de senha".
Preencha as secoes abaixo e apague os comentarios de instrucao.
-->

## Card

Refs: SUC-

<!-- Se o PR cobrir mais de um card, liste todos aqui e mantenha no titulo o principal. -->

## O que muda

<!-- Em prosa curta: o que este PR faz. Nao repita a lista de arquivos; o diff ja mostra. -->

## Por que

<!-- O problema que resolve ou a decisao que executa. Decisoes tomadas durante a implementacao
     entram aqui E como comentario no card. -->

## Como verificar

<!-- Passos para conferir na pratica. Havendo endpoint novo, inclua metodo, rota, payload e os
     codigos de resposta esperados — inclusive os de erro. -->

## Riscos e o que ficou de fora

<!-- Limitacoes conhecidas, divida criada de proposito (com o card de remocao), e o que nao
     entrou neste PR e por que. "Nada" e uma resposta valida — deixar em branco nao e.
     Mudanca de contrato de API, migration e variavel de ambiente nova entram SEMPRE aqui. -->

## Checklist

- [ ] `npm run check` passa
- [ ] Teste unitario para toda logica de negocio nova
- [ ] Casos de erro cobertos (403 de outro circuito, 404, 409 de unicidade, 422 de regra de negocio)
- [ ] Migration no mesmo commit da mudanca de `schema.prisma` que a originou
- [ ] Variavel de ambiente nova documentada no `.env.example` e no `README.md`
- [ ] Endpoint novo adicionado em `docs/suoac_postman_collection.json`
- [ ] Card atualizado no Jira: comentario com o que foi entregue e estado correto
- [ ] Contrato de API novo ou alterado comentado tambem no card da fatia que consome
- [ ] Commits no padrao Conventional Commits, com `Refs: SUC-XX` e **sem** trailer de atribuicao a IA
- [ ] `README.md` e `PROGRESS.md` atualizados, quando aplicavel
