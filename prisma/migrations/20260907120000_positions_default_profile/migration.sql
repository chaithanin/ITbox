-- Position master + default-profile enrichments. Fully additive & backward
-- compatible: existing users, roles and permissions are untouched.

-- Project/data scope enum for default profiles.
DO $$ BEGIN
  CREATE TYPE "ProjectScope" AS ENUM ('OWN_DATA','OWN_TEAM','ASSIGNED_PROJECTS','SELECTED_PROJECTS','DEPARTMENT','ALL_PROJECTS','COMPANY_WIDE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Positions master table.
CREATE TABLE IF NOT EXISTS "positions" (
  "id"             UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "code"           TEXT,
  "name"           TEXT NOT NULL,
  "departmentId"   UUID,
  "jobLevel"       "JobLevel",
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "positions_organizationId_departmentId_idx" ON "positions"("organizationId", "departmentId");
DO $$ BEGIN
  ALTER TABLE "positions" ADD CONSTRAINT "positions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "positions" ADD CONSTRAINT "positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Default-profile enrichments (nullable → safe for existing rows).
ALTER TABLE "permission_profiles" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "permission_profiles" ADD COLUMN IF NOT EXISTS "roleKey" TEXT;
ALTER TABLE "permission_profiles" ADD COLUMN IF NOT EXISTS "projectScope" "ProjectScope";
