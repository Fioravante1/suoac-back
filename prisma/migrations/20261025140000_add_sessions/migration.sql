-- SUC-77: sessao por dispositivo.
--
-- Expand puro: uma tabela nova. A versao anterior da aplicacao nao a conhece e
-- segue gravando `users.refresh_token_hash`, que continua existindo. A coluna
-- so sai (contract) no deploy seguinte, com todas as instancias no codigo novo.
--
-- Nao ha backfill: as sessoes abertas antes do deploy guardam o refresh em
-- `users.refresh_token_hash` e deixam de renovar; cada usuario entra de novo
-- uma vez.

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "extended" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_user_id_last_used_at_idx" ON "sessions"("user_id", "last_used_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
