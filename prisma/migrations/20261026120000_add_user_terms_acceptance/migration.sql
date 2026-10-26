-- SUC-85: registro do aceite dos termos de uso.
--
-- Expand puro: duas colunas anulaveis, sem default e sem backfill. A versao
-- anterior da aplicacao nao as conhece e segue criando usuarios sem elas; quem
-- ja existe fica sem aceite registrado e nao e forcado a aceitar nada.
--
-- Reversao: ALTER TABLE "users" DROP COLUMN "terms_accepted_at", DROP COLUMN "terms_version";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "terms_accepted_at" TIMESTAMP(3),
ADD COLUMN     "terms_version" VARCHAR(10);
