-- AlterTable
ALTER TABLE "congregations" ADD COLUMN     "code" VARCHAR(20) NOT NULL,
ADD COLUMN     "email" VARCHAR(255) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "congregations_code_key" ON "congregations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "congregations_email_key" ON "congregations"("email");
