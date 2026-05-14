-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CIRCUIT_COORDINATOR', 'CIRCUIT_ASSISTANT', 'CONGREGATION_COORDINATOR', 'CONGREGATION_ASSISTANT');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('ASSEMBLY', 'REGIONAL_CONVENTION');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'FINISHED');

-- CreateEnum
CREATE TYPE "EventDayStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'EXEMPT');

-- CreateEnum
CREATE TYPE "CongregationListStatus" AS ENUM ('PENDING', 'FINALIZED');

-- CreateTable
CREATE TABLE "circuits" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "circuits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "congregations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "city" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "circuit_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "congregations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "circuit_id" UUID NOT NULL,
    "congregation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" "EventType" NOT NULL,
    "ticket_price" DECIMAL(10,2) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "registration_deadline" TIMESTAMP(3) NOT NULL,
    "payment_deadline" TIMESTAMP(3) NOT NULL,
    "venue" VARCHAR(200) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "observations" TEXT,
    "circuit_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_days" (
    "id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "departure_time" VARCHAR(5) NOT NULL,
    "return_time" VARCHAR(5) NOT NULL,
    "status" "EventDayStatus" NOT NULL DEFAULT 'ACTIVE',
    "event_id" UUID NOT NULL,

    CONSTRAINT "event_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passengers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "rg_encrypted" TEXT NOT NULL,
    "rg_hash" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(20),
    "observations" TEXT,
    "congregation_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_passengers" (
    "id" UUID NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "exemption_reason" VARCHAR(300),
    "observations" TEXT,
    "event_id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "congregation_id" UUID NOT NULL,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_passenger_days" (
    "id" UUID NOT NULL,
    "checked_in" BOOLEAN NOT NULL DEFAULT false,
    "checked_in_at" TIMESTAMP(3),
    "event_passenger_id" UUID NOT NULL,
    "event_day_id" UUID NOT NULL,

    CONSTRAINT "event_passenger_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "observations" TEXT,
    "event_passenger_id" UUID NOT NULL,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "congregation_event_status" (
    "id" UUID NOT NULL,
    "status" "CongregationListStatus" NOT NULL DEFAULT 'PENDING',
    "congregation_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "finalized_by_id" UUID,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "congregation_event_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "circuit_id" UUID NOT NULL,
    "congregation_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "entity" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "details" JSONB,
    "ip" VARCHAR(45),
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "congregations_circuit_id_idx" ON "congregations"("circuit_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_circuit_id_idx" ON "users"("circuit_id");

-- CreateIndex
CREATE INDEX "users_congregation_id_idx" ON "users"("congregation_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "events_circuit_id_idx" ON "events"("circuit_id");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "event_days_event_id_idx" ON "event_days"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_days_event_id_date_key" ON "event_days"("event_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "event_days_event_id_day_number_key" ON "event_days"("event_id", "day_number");

-- CreateIndex
CREATE INDEX "passengers_congregation_id_idx" ON "passengers"("congregation_id");

-- CreateIndex
CREATE INDEX "passengers_rg_hash_idx" ON "passengers"("rg_hash");

-- CreateIndex
CREATE UNIQUE INDEX "passengers_congregation_id_rg_hash_key" ON "passengers"("congregation_id", "rg_hash");

-- CreateIndex
CREATE INDEX "event_passengers_event_id_idx" ON "event_passengers"("event_id");

-- CreateIndex
CREATE INDEX "event_passengers_passenger_id_idx" ON "event_passengers"("passenger_id");

-- CreateIndex
CREATE INDEX "event_passengers_congregation_id_idx" ON "event_passengers"("congregation_id");

-- CreateIndex
CREATE INDEX "event_passengers_payment_status_idx" ON "event_passengers"("payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "event_passengers_event_id_passenger_id_key" ON "event_passengers"("event_id", "passenger_id");

-- CreateIndex
CREATE INDEX "event_passenger_days_event_passenger_id_idx" ON "event_passenger_days"("event_passenger_id");

-- CreateIndex
CREATE INDEX "event_passenger_days_event_day_id_idx" ON "event_passenger_days"("event_day_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_passenger_days_event_passenger_id_event_day_id_key" ON "event_passenger_days"("event_passenger_id", "event_day_id");

-- CreateIndex
CREATE INDEX "payments_event_passenger_id_idx" ON "payments"("event_passenger_id");

-- CreateIndex
CREATE INDEX "congregation_event_status_event_id_idx" ON "congregation_event_status"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "congregation_event_status_congregation_id_event_id_key" ON "congregation_event_status"("congregation_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_token_idx" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_circuit_id_idx" ON "invitations"("circuit_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "congregations" ADD CONSTRAINT "congregations_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_days" ADD CONSTRAINT "event_days_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passengers" ADD CONSTRAINT "passengers_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_passengers" ADD CONSTRAINT "event_passengers_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_passengers" ADD CONSTRAINT "event_passengers_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_passengers" ADD CONSTRAINT "event_passengers_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_passengers" ADD CONSTRAINT "event_passengers_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_passenger_days" ADD CONSTRAINT "event_passenger_days_event_passenger_id_fkey" FOREIGN KEY ("event_passenger_id") REFERENCES "event_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_passenger_days" ADD CONSTRAINT "event_passenger_days_event_day_id_fkey" FOREIGN KEY ("event_day_id") REFERENCES "event_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_passenger_id_fkey" FOREIGN KEY ("event_passenger_id") REFERENCES "event_passengers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "congregation_event_status" ADD CONSTRAINT "congregation_event_status_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "congregation_event_status" ADD CONSTRAINT "congregation_event_status_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "congregation_event_status" ADD CONSTRAINT "congregation_event_status_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_circuit_id_fkey" FOREIGN KEY ("circuit_id") REFERENCES "circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_congregation_id_fkey" FOREIGN KEY ("congregation_id") REFERENCES "congregations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
