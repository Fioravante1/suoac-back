-- SUC-127 (absorvido pelo SUC-108): os prazos do evento vencem no fim do dia em
-- Sao Paulo, e nao as 21h da vespera.
--
-- O formulario envia o prazo como data ("2026-10-12"), e a API gravava a meia-noite
-- UTC: 21h de 11/10 em Sao Paulo. O ciclo de vida encerrava as inscricoes na vespera
-- do dia que a tela prometia. A API passa a gravar o ultimo instante do dia em Sao
-- Paulo (`endOfDayInEventTimezone`): 12/10 23:59:59.999 la, `2026-10-13 02:59:59.999`
-- em UTC. Esta migration leva o que ja foi gravado para a mesma regra.
--
-- So corrige o valor que esta exatamente na meia-noite UTC, que e o que a API antiga
-- gravava a partir de uma data. Por isso a migration pode rodar de novo sem efeito.
--
-- Compativel com a versao anterior da aplicacao: ela so compara o prazo com o agora,
-- e com o valor corrigido encerra no momento certo. Evento criado ou editado por ela
-- entre esta migration e a troca de versao fica com a meia-noite UTC; rodar de novo
-- as duas instrucoes abaixo corrige.
--
-- As colunas sao `timestamp` sem fuso, em UTC: a data + 1 vira meia-noite local de
-- Sao Paulo, `AT TIME ZONE 'America/Sao_Paulo'` a interpreta como hora de la, e
-- `AT TIME ZONE 'UTC'` devolve o instante em UTC, de onde sai 1 milissegundo.
-- Reversao: `date_trunc('day', coluna AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`.

UPDATE "events"
SET "registration_deadline" =
  ((("registration_deadline"::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
  - INTERVAL '1 millisecond'
WHERE "registration_deadline" = date_trunc('day', "registration_deadline");

UPDATE "events"
SET "payment_deadline" =
  ((("payment_deadline"::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')
  - INTERVAL '1 millisecond'
WHERE "payment_deadline" = date_trunc('day', "payment_deadline");
