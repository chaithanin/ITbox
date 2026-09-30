-- Drive & User Setup (Service Desk): new-user provisioning sheet. Fully additive.
-- The login username/password is NOT stored here — it lives in the Vault; this
-- table only references it via credentialVaultItemId.

CREATE TABLE IF NOT EXISTS "drive_mappings" (
  "id"                    UUID NOT NULL,
  "organizationId"        UUID NOT NULL,
  "employeeId"            UUID,
  "employeeCode"          TEXT,
  "employeeName"          TEXT,
  "nickname"              TEXT,
  "position"              TEXT,
  "computerName"          TEXT,
  "userShare"             TEXT,
  "loginUsername"         TEXT,
  "drives"                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "credentialVaultItemId" UUID,
  "status"                TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes"                 TEXT,
  "createdById"           UUID,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"             TIMESTAMP(3),
  CONSTRAINT "drive_mappings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "drive_mappings_organizationId_status_idx" ON "drive_mappings"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "drive_mappings_organizationId_employeeId_idx" ON "drive_mappings"("organizationId", "employeeId");

DO $$ BEGIN
  ALTER TABLE "drive_mappings" ADD CONSTRAINT "drive_mappings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "drive_mappings" ADD CONSTRAINT "drive_mappings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
