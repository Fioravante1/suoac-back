-- SUC-72: pedido de novo convite feito pelo convidado com o link expirado.
--
-- Expand puro: uma coluna nula, sem default nem reescrita. A versao anterior
-- da aplicacao nao a conhece e segue funcionando. Guarda o instante do ultimo
-- pedido, que limita o aviso ao circuito a um por janela.

-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "renewal_requested_at" TIMESTAMP(3);
