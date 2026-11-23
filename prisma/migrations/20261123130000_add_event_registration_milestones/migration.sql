-- SUC-126 (absorvido pelo SUC-108): quando as inscricoes do evento abriram e quando
-- encerraram. A linha de etapas do painel novo mostra "Inscricoes abertas desde DD/MM"
-- e a data real do encerramento, que pode vir antes do prazo.
--
-- Aditiva: duas colunas que aceitam nulo. A versao anterior da aplicacao nao as le
-- nem as grava; um evento publicado ou encerrado por ela entre esta migration e a
-- troca de versao fica com a coluna nula, como um evento antigo sem registro.

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "registration_closed_at" TIMESTAMP(3);

-- Backfill a partir do audit log, que a troca de status grava desde o inicio.
-- O audit log e gravado sem esperar e pode faltar: sem o registro, a coluna fica
-- nula, e o painel mostra a etapa sem a data.

-- Publicacao: a primeira troca DRAFT -> OPEN do evento. Atualizacao de outros campos
-- tambem grava `status` em `newValues`, por isso o `oldValues` e conferido junto.
UPDATE "events" AS "event"
SET "published_at" = "opened"."created_at"
FROM (
  SELECT "entity_id", MIN("created_at") AS "created_at"
  FROM "audit_logs"
  WHERE "action" = 'UPDATE'
    AND "entity" = 'Event'
    AND "details" -> 'oldValues' ->> 'status' = 'DRAFT'
    AND "details" -> 'newValues' ->> 'status' = 'OPEN'
  GROUP BY "entity_id"
) AS "opened"
WHERE "event"."id" = "opened"."entity_id"
  AND "event"."status" <> 'DRAFT';

-- Encerramento: a primeira troca OPEN -> CLOSED. Quando quem encerrou foi o ciclo de
-- vida (`actor.type = SYSTEM`), as inscricoes acabaram no prazo, e nao na hora em que
-- o job passou: o encerramento e o proprio prazo, ja corrigido para o fim do dia em
-- Sao Paulo pela migration anterior.
UPDATE "events" AS "event"
SET "registration_closed_at" = CASE
  WHEN "closed"."by_lifecycle" THEN "event"."registration_deadline"
  ELSE "closed"."created_at"
END
FROM (
  SELECT DISTINCT ON ("entity_id")
    "entity_id",
    "created_at",
    COALESCE("details" -> 'actor' ->> 'type' = 'SYSTEM', FALSE) AS "by_lifecycle"
  FROM "audit_logs"
  WHERE "action" = 'UPDATE'
    AND "entity" = 'Event'
    AND "details" -> 'oldValues' ->> 'status' = 'OPEN'
    AND "details" -> 'newValues' ->> 'status' = 'CLOSED'
  ORDER BY "entity_id", "created_at"
) AS "closed"
WHERE "event"."id" = "closed"."entity_id"
  AND "event"."status" IN ('CLOSED', 'FINISHED');
