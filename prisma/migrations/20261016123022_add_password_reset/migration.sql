-- AlterTable
ALTER TABLE "users" ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(64),
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_requests_token_hash_key" ON "password_reset_requests"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_requests_email_created_at_idx" ON "password_reset_requests"("email", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_requests_user_id_idx" ON "password_reset_requests"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
