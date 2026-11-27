-- AlterTable
ALTER TABLE "events" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_id" UUID;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
