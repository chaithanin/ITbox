-- SIM / phone-line registry (AIS / DTAC / TRUE …)
CREATE TYPE "SimStatus" AS ENUM ('ACTIVE', 'UNUSED', 'SUSPENDED', 'TERMINATED');

CREATE TABLE "sim_cards" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "phoneNumber"    TEXT NOT NULL,
  "carrier"        TEXT NOT NULL,
  "accountName"    TEXT,
  "holder"         TEXT,
  "employeeId"     UUID,
  "departmentId"   UUID,
  "status"         "SimStatus" NOT NULL DEFAULT 'ACTIVE',
  "simSerial"      TEXT,
  "plan"           TEXT,
  "monthlyFee"     DECIMAL(12,2),
  "startDate"      TIMESTAMP(3),
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "sim_cards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sim_cards_organizationId_phoneNumber_key" ON "sim_cards"("organizationId", "phoneNumber");
CREATE INDEX "sim_cards_organizationId_status_idx" ON "sim_cards"("organizationId", "status");

ALTER TABLE "sim_cards" ADD CONSTRAINT "sim_cards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sim_cards" ADD CONSTRAINT "sim_cards_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sim_cards" ADD CONSTRAINT "sim_cards_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
