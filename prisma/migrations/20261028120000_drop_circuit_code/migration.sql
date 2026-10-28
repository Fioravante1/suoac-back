-- SUC-60 (etapa 3 do contract): remove a coluna transitoria `circuits.code`.
--
-- Contract puro, destrutivo. So e seguro porque as etapas anteriores ja estao em
-- producao: nenhum client Prisma em execucao referencia `code` (o campo saiu do
-- schema na etapa 2) e o backfill `name = code` ja rodou (etapa 1). Se esta
-- migration rodar com uma versao anterior a etapa 2 ainda no ar, as queries dela
-- que selecionam todas as colunas de `circuits` falham.
--
-- A guarda abaixo protege os dados: se alguma linha ainda tiver `code` diferente
-- de `name`, a coluna guardaria um valor que ninguem migrou. A migration aborta, o
-- Railway aborta o deploy e a versao anterior segue servindo.
--
-- Reversao: ALTER TABLE "circuits" ADD COLUMN "code" VARCHAR(20);
--           UPDATE "circuits" SET "code" = "name" WHERE length("name") <= 20;
--           CREATE UNIQUE INDEX "circuits_code_key" ON "circuits"("code");
-- Os valores restaurados sao copias de `name`, que era o que a dupla escrita gravava.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "circuits" WHERE "code" IS NOT NULL AND "code" <> "name") THEN
    RAISE EXCEPTION 'circuits.code ainda difere de circuits.name em alguma linha; rode o backfill antes de remover a coluna';
  END IF;
END $$;

-- DropIndex
DROP INDEX "circuits_code_key";

-- AlterTable
ALTER TABLE "circuits" DROP COLUMN "code";
