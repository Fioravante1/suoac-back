-- SUC-68: recusa de convite pelo próprio convidado.
--
-- Expand puro: um tipo novo e duas colunas nuláveis, sem default nem
-- reescrita. A versão anterior da aplicação não conhece as colunas e segue
-- funcionando; o estado `DECLINED` é derivado de `declined_at`.

-- CreateEnum
CREATE TYPE "InvitationDeclineReason" AS ENUM ('NOT_THE_PERSON', 'CANNOT_ASSUME_NOW', 'RECEIVED_BY_MISTAKE');

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "decline_reason" "InvitationDeclineReason",
ADD COLUMN     "declined_at" TIMESTAMP(3);
