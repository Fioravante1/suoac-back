-- SUC-36: remodela `invitations` para o convite de coordenador de congregação.
--
-- Esta migration renomeia coluna e torna colunas NOT NULL, o que a regra de
-- expand-and-contract normalmente proíbe num deploy só. É seguro aqui porque a
-- tabela nunca foi escrita nem lida por código algum (nenhum service, seed ou
-- teste a usa), então está vazia e a versão anterior da aplicação não a toca.

-- DropIndex
DROP INDEX "invitations_token_idx";

-- AlterTable
ALTER TABLE "invitations" RENAME COLUMN "token" TO "token_hash";
ALTER INDEX "invitations_token_key" RENAME TO "invitations_token_hash_key";
ALTER TABLE "invitations" ADD COLUMN     "name" VARCHAR(150) NOT NULL,
ADD COLUMN     "phone" VARCHAR(20),
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ALTER COLUMN "token_hash" SET DATA TYPE VARCHAR(64),
ALTER COLUMN "congregation_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_congregation_id_fkey";

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "invitations_congregation_id_idx" ON "invitations"("congregation_id");
