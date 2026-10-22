-- AlterTable
ALTER TABLE "circuits" ADD COLUMN     "code" VARCHAR(20);

-- AlterTable
ALTER TABLE "congregations" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" VARCHAR(20);

-- CreateTable
CREATE TABLE "circuit_signup_requests" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "code_hash" VARCHAR(64),
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "circuit_signup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "circuit_signup_requests_email_created_at_idx" ON "circuit_signup_requests"("email", "created_at");

-- CreateIndex
CREATE INDEX "circuit_signup_requests_created_at_idx" ON "circuit_signup_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "circuits_code_key" ON "circuits"("code");

