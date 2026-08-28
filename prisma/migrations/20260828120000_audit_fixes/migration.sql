-- Asset network/cellular identifiers (D-14)
ALTER TABLE "assets" ADD COLUMN "macAddress" TEXT;
ALTER TABLE "assets" ADD COLUMN "imei" TEXT;

-- SLA "approaching" warning flag so a warning fires once (D-12)
ALTER TABLE "support_cases" ADD COLUMN "slaWarned" BOOLEAN NOT NULL DEFAULT false;

-- Notification recent-list index (D-20)
CREATE INDEX "notifications_organizationId_userId_createdAt_idx" ON "notifications"("organizationId", "userId", "createdAt");
