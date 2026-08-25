-- CreateEnum
CREATE TYPE "ItSystemCategory" AS ENUM ('SERVER', 'BACKUP', 'STORAGE', 'CCTV', 'PHONE', 'GPS', 'LOG', 'MANGO_LOGIN', 'MANGO_USAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ItHealthStatus" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL', 'NOT_CHECKED');

-- CreateEnum
CREATE TYPE "ItReportMode" AS ENUM ('AUTO', 'CHECK_REQUIRED', 'ISSUE');

-- CreateTable
CREATE TABLE "it_health_checks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "checkDate" DATE NOT NULL,
    "category" "ItSystemCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "locationId" UUID,
    "mode" "ItReportMode" NOT NULL DEFAULT 'CHECK_REQUIRED',
    "status" "ItHealthStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "healthPercent" INTEGER,
    "metrics" JSONB,
    "note" TEXT,
    "issueCaseId" UUID,
    "checkedById" UUID,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "it_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "it_health_checks_organizationId_checkDate_idx" ON "it_health_checks"("organizationId", "checkDate");

-- CreateIndex
CREATE INDEX "it_health_checks_organizationId_category_status_idx" ON "it_health_checks"("organizationId", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "it_health_checks_organizationId_checkDate_category_name_key" ON "it_health_checks"("organizationId", "checkDate", "category", "name");

-- AddForeignKey
ALTER TABLE "it_health_checks" ADD CONSTRAINT "it_health_checks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_health_checks" ADD CONSTRAINT "it_health_checks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
