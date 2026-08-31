-- Add HR employee code (staff ID) to user accounts for deterministic
-- employee <-> user reconciliation. Nullable, unique per organization.
ALTER TABLE "users" ADD COLUMN "employeeCode" TEXT;

-- Postgres allows multiple NULLs under a UNIQUE index, so accounts without a
-- code do not collide.
CREATE UNIQUE INDEX "users_organizationId_employeeCode_key" ON "users"("organizationId", "employeeCode");
