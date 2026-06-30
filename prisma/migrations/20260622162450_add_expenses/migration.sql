-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('BUS_PAYMENT', 'OTHER');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "incurred_at" TIMESTAMP(3) NOT NULL,
    "observations" TEXT,
    "event_id" UUID NOT NULL,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_event_id_idx" ON "expenses"("event_id");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
