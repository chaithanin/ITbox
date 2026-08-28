-- Preventive maintenance support (D-15)
CREATE TYPE "MaintenanceType" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

ALTER TABLE "asset_maintenance" ADD COLUMN "type" "MaintenanceType" NOT NULL DEFAULT 'CORRECTIVE';
ALTER TABLE "asset_maintenance" ADD COLUMN "scheduledDate" DATE;
ALTER TABLE "asset_maintenance" ADD COLUMN "recurrenceDays" INTEGER;
ALTER TABLE "asset_maintenance" ADD COLUMN "nextDueAt" DATE;
