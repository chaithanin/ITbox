-- Access-request document approval workflow (document-only sign-off tracking,
-- matches the 4.A signature blocks). All nullable / additive — existing rows
-- are unaffected and existing statuses keep working.
ALTER TABLE "access_requests"
  ADD COLUMN IF NOT EXISTS "managerApprovedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "managerApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "itSupportBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "itSupportAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "itManagerBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "itManagerAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "managementBy"      TEXT,
  ADD COLUMN IF NOT EXISTS "managementAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason"   TEXT;
