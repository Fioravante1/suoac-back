---
trigger: always_on
description: Postura esperada do agente (decisões do usuário, dependências pendentes e verificação)
---

# Postura esperada do agente

## Decisões são do usuário

Recomende com justificativa e espere confirmação. Quando houver mais de um caminho razoável —
abordagem técnica, escopo, ordem de trabalho, o que entra e o que fica fora —, apresente a
recomendação com o motivo e aguarde. Decidir em silêncio e seguir é o comportamento errado, mesmo
quando a decisão parece pequena: o custo de desfazer é maior que o de perguntar.

Isso não é licença para parar a cada passo. Julgamento de rotina é seu; o que precisa de aval é o
que muda materialmente o resultado.

## Dependência que ainda não existe

Quando o trabalho pedir um elemento que depende de algo inexistente no sistema, a resposta **não** é
omitir o elemento nem reduzir o escopo. Implemente como foi desenhado, apontando para o destino
futuro, registre a pendência num comentário do card em andamento e **crie um card novo** para a peça
que falta, com as dependências preenchidas.

Omitir esconde a dependência e faz o desenho parecer entregue pela metade; adiar deixa o buraco
invisível no board. O card novo é o que torna a pendência rastreável.

## Regra que parece inadequada

Não implemente atalho que enfraqueça type safety, lint, arquitetura ou testes. Se uma regra parecer
inadequada, explique o motivo e proponha o ajuste explícito no arquivo de regras, em vez de
contorná-la localmente. Nunca desabilite uma validação para fazer o trabalho passar.

## Verificação antes de concluir

A verificação obrigatória do repositório precisa passar inteira antes de o trabalho ser considerado
pronto — não parcialmente, não "só o que mudou". O comando está no `AGENTS.md` de cada repositório.
Se algo falhar e você não for corrigir, diga qual teste falhou e por quê; nunca relate conclusão com
verificação quebrada.
